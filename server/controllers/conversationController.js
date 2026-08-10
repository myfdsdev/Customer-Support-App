'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const {
  Conversation,
  Message,
  Customer,
  CustomerProduct,
  Ticket,
  User,
  AnalyticsEvent,
} = require('../models');
const support = require('../services/support');
const presence = require('../services/support/presenceService');
const gemini = require('../services/gemini');
const rag = require('../services/rag');
const emitter = require('../services/socket/emitter');
const { accessibleProductIds } = require('../middleware/auth');
const {
  CONVERSATION_STATUS,
  OPEN_STATUSES,
  SENDER_TYPE,
  MESSAGE_TYPE,
  PRIORITY_LIST,
  CONVERSATION_STATUS_LIST,
  GLOBAL_ROLES,
} = require('../utils/constants');

/** Builds the inbox filter from query params + the agent's product scope. */
async function buildFilter(req) {
  const { filter = 'all', productId, priority, status, search } = req.query;
  const q = {};

  const scope = await accessibleProductIds(req.user);
  if (scope) q.productId = { $in: scope };
  if (productId) q.productId = productId;

  switch (filter) {
    case 'unassigned':
      q.assignedAgentId = null;
      q.status = { $in: OPEN_STATUSES };
      break;
    case 'mine':
      q.assignedAgentId = req.user._id;
      q.status = { $in: OPEN_STATUSES };
      break;
    case 'active':
      q.status = CONVERSATION_STATUS.ACTIVE;
      break;
    case 'waiting':
      q.status = { $in: [CONVERSATION_STATUS.WAITING_CUSTOMER, CONVERSATION_STATUS.WAITING_TEAM] };
      break;
    case 'urgent':
      q.priority = 'urgent';
      q.status = { $in: OPEN_STATUSES };
      break;
    case 'resolved':
      q.status = { $in: [CONVERSATION_STATUS.RESOLVED, CONVERSATION_STATUS.CLOSED] };
      break;
    case 'ai':
      q.channel = 'ai';
      q.status = { $in: OPEN_STATUSES };
      break;
    case 'open':
      q.status = { $in: OPEN_STATUSES };
      break;
    default:
      break;
  }

  if (status && CONVERSATION_STATUS_LIST.includes(status)) q.status = status;
  if (priority && PRIORITY_LIST.includes(priority)) q.priority = priority;
  if (search) q.$or = [{ lastMessagePreview: new RegExp(search, 'i') }, { subject: new RegExp(search, 'i') }];

  return q;
}

/** GET /api/conversations */
const listConversations = asyncHandler(async (req, res) => {
  const filter = await buildFilter(req);
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const page = Number(req.query.page) || 1;

  const [conversations, total] = await Promise.all([
    Conversation.find(filter)
      .populate('customerId', 'name email phone tags presenceStatus lastSeenAt')
      .populate('productId', 'name slug logo brandColor')
      .populate('assignedAgentId', 'name avatar')
      .sort({ lastMessageAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Conversation.countDocuments(filter),
  ]);

  // Live presence per customer, resolved in one query rather than per row.
  const online = await presence.listOnline({ limit: 500 });
  const presenceByCustomer = online.reduce((acc, s) => {
    if (s.customerId) acc[String(s.customerId._id || s.customerId)] = s.presenceStatus;
    return acc;
  }, {});

  res.json({
    success: true,
    data: conversations.map((c) => ({
      ...c,
      customerPresence: presenceByCustomer[String(c.customerId?._id)] || 'offline',
    })),
    meta: { total, page, limit },
  });
});

/** GET /api/conversations/counts — badge numbers for the inbox filters. */
const listCounts = asyncHandler(async (req, res) => {
  const scope = await accessibleProductIds(req.user);
  const base = scope ? { productId: { $in: scope } } : {};

  const [all, unassigned, mine, active, waiting, urgent, resolved] = await Promise.all([
    Conversation.countDocuments({ ...base, status: { $in: OPEN_STATUSES } }),
    Conversation.countDocuments({ ...base, assignedAgentId: null, status: { $in: OPEN_STATUSES } }),
    Conversation.countDocuments({ ...base, assignedAgentId: req.user._id, status: { $in: OPEN_STATUSES } }),
    Conversation.countDocuments({ ...base, status: CONVERSATION_STATUS.ACTIVE }),
    Conversation.countDocuments({
      ...base,
      status: { $in: [CONVERSATION_STATUS.WAITING_CUSTOMER, CONVERSATION_STATUS.WAITING_TEAM] },
    }),
    Conversation.countDocuments({ ...base, priority: 'urgent', status: { $in: OPEN_STATUSES } }),
    Conversation.countDocuments({
      ...base,
      status: { $in: [CONVERSATION_STATUS.RESOLVED, CONVERSATION_STATUS.CLOSED] },
    }),
  ]);

  res.json({ success: true, data: { all, unassigned, mine, active, waiting, urgent, resolved } });
});

/** Confirms the agent may open this conversation's product. */
async function assertAccess(req, conversation) {
  if (GLOBAL_ROLES.includes(req.user.role)) return;
  const scope = await accessibleProductIds(req.user);
  if (!scope) return;
  if (!scope.some((id) => String(id) === String(conversation.productId?._id || conversation.productId))) {
    throw ApiError.forbidden('You are not assigned to this product');
  }
}

/** GET /api/conversations/:id — full thread + the customer context panel. */
const getConversation = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id)
    .populate('customerId')
    .populate('productId', 'name slug logo brandColor loginUrl websiteUrl')
    .populate('assignedAgentId', 'name email avatar title isOnline');

  if (!conversation) throw ApiError.notFound('Conversation not found');
  await assertAccess(req, conversation);

  const customerId = conversation.customerId?._id;

  const [messages, customerPresence, previousConversations, tickets, products] = await Promise.all([
    Message.find({ conversationId: conversation._id }).sort({ createdAt: 1 }).limit(500).lean(),
    customerId ? presence.getCustomerPresence(customerId) : null,
    customerId
      ? Conversation.find({ customerId, _id: { $ne: conversation._id } })
          .populate('productId', 'name slug')
          .select('status priority lastMessagePreview lastMessageAt createdAt resolvedAt detectedIntent')
          .sort({ lastMessageAt: -1 })
          .limit(10)
          .lean()
      : [],
    customerId
      ? Ticket.find({ customerId })
          .select('ticketNumber title status priority createdAt')
          .sort({ createdAt: -1 })
          .limit(10)
          .lean()
      : [],
    customerId
      ? CustomerProduct.find({ customerId }).populate('productId', 'name slug logo').lean()
      : [],
  ]);

  await support.markReadByAgent(conversation._id, req.user._id);

  res.json({
    success: true,
    data: {
      conversation: conversation.toObject(),
      messages: messages.map((m) => support.serializeMessage(m)),
      customer: conversation.customerId,
      customerPresence,
      previousConversations,
      tickets,
      products,
    },
  });
});

/** POST /api/conversations/:id/messages — agent reply or internal note. */
const sendMessage = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);
  if (!conversation) throw ApiError.notFound('Conversation not found');
  await assertAccess(req, conversation);

  const content = String(req.body.content || '').trim();
  const isInternal = Boolean(req.body.isInternal);
  if (!content && !req.file) throw ApiError.badRequest('Message cannot be empty');

  // Replying to an unclaimed chat claims it — agents should not have to
  // remember to press Assign before typing.
  if (!conversation.assignedAgentId && !isInternal) {
    conversation.assignedAgentId = req.user._id;
    conversation.status = CONVERSATION_STATUS.ACTIVE;
    conversation.channel = 'human';
    await conversation.save();
    emitter.toAgents('conversation:assigned', {
      conversationId: String(conversation._id),
      agentId: String(req.user._id),
      agentName: req.user.name,
    });
  }

  const message = await support.addMessage({
    conversation,
    senderType: SENDER_TYPE.AGENT,
    senderId: req.user._id,
    senderName: req.user.name,
    content,
    messageType: req.file
      ? req.file.mimetype.startsWith('image/')
        ? MESSAGE_TYPE.IMAGE
        : MESSAGE_TYPE.FILE
      : MESSAGE_TYPE.TEXT,
    isInternal,
    attachment: req.file
      ? {
          url: `/uploads/${req.file.filename}`,
          name: req.file.originalname,
          type: req.file.mimetype,
          size: req.file.size,
        }
      : null,
  });

  if (!isInternal) {
    await Customer.updateOne(
      { _id: conversation.customerId },
      { $inc: { 'stats.humanInteractions': 1 }, $set: { lastContactAt: new Date() } }
    ).catch(() => null);
  }

  res.status(201).json({ success: true, data: support.serializeMessage(message) });
});

/** POST /api/conversations/:id/assign */
const assignConversation = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);
  if (!conversation) throw ApiError.notFound('Conversation not found');
  await assertAccess(req, conversation);

  const agentId = req.body.agentId || req.user._id;
  const agent = await User.findById(agentId).select('name avatar role');
  if (!agent) throw ApiError.notFound('Agent not found');

  conversation.assignedAgentId = agent._id;
  conversation.channel = 'human';
  if ([CONVERSATION_STATUS.NEW, CONVERSATION_STATUS.UNASSIGNED].includes(conversation.status)) {
    conversation.status = CONVERSATION_STATUS.ACTIVE;
  }
  await conversation.save();

  await support.addMessage({
    conversation,
    senderType: SENDER_TYPE.SYSTEM,
    senderName: 'System',
    content: `${agent.name} joined the conversation.`,
    messageType: MESSAGE_TYPE.SYSTEM,
  });

  const payload = {
    conversationId: String(conversation._id),
    agentId: String(agent._id),
    agentName: agent.name,
    status: conversation.status,
  };
  emitter.toAgents('conversation:assigned', payload);
  emitter.toAgent(agent._id, 'conversation:assigned', payload);
  emitter.toConversation(conversation._id, 'conversation:assigned', payload);

  res.json({ success: true, data: support.serializeConversationLite(conversation) });
});

/** POST /api/conversations/:id/transfer */
const transferConversation = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);
  if (!conversation) throw ApiError.notFound('Conversation not found');
  await assertAccess(req, conversation);

  const { agentId, note } = req.body;
  const agent = await User.findById(agentId).select('name');
  if (!agent) throw ApiError.notFound('Target agent not found');

  const previous = conversation.assignedAgentId;
  conversation.assignedAgentId = agent._id;
  conversation.status = CONVERSATION_STATUS.ACTIVE;
  await conversation.save();

  await support.addMessage({
    conversation,
    senderType: SENDER_TYPE.SYSTEM,
    senderName: 'System',
    content: `Conversation transferred to ${agent.name} by ${req.user.name}.${note ? `\nNote: ${note}` : ''}`,
    messageType: MESSAGE_TYPE.SYSTEM,
  });

  emitter.toAgents('conversation:assigned', {
    conversationId: String(conversation._id),
    agentId: String(agent._id),
    agentName: agent.name,
    transferredFrom: previous ? String(previous) : null,
  });
  emitter.toAgent(agent._id, 'conversation:assigned', { conversationId: String(conversation._id) });

  res.json({ success: true, data: support.serializeConversationLite(conversation) });
});

/** PATCH /api/conversations/:id — status, priority, tags, subject. */
const updateConversation = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);
  if (!conversation) throw ApiError.notFound('Conversation not found');
  await assertAccess(req, conversation);

  const { status, priority, tags, subject } = req.body;

  if (status) {
    if (!CONVERSATION_STATUS_LIST.includes(status)) throw ApiError.badRequest('Invalid status');
    const wasClosed = [CONVERSATION_STATUS.RESOLVED, CONVERSATION_STATUS.CLOSED].includes(conversation.status);
    const nowOpen = OPEN_STATUSES.includes(status);
    if (wasClosed && nowOpen) {
      conversation.reopenedCount += 1;
      conversation.resolvedAt = null;
      conversation.closedAt = null;
    }
    conversation.status = status;
    if (status === CONVERSATION_STATUS.RESOLVED) {
      conversation.resolvedAt = new Date();
      conversation.resolvedBy = req.user._id;
      conversation.resolvedByType = 'agent';
    }
    if (status === CONVERSATION_STATUS.CLOSED) conversation.closedAt = new Date();
  }

  if (priority && PRIORITY_LIST.includes(priority)) conversation.priority = priority;
  if (Array.isArray(tags)) conversation.tags = tags.map(String).slice(0, 20);
  if (subject !== undefined) conversation.subject = String(subject).slice(0, 200);

  await conversation.save();

  const lite = support.serializeConversationLite(conversation);
  emitter.toAgents('conversation:updated', lite);
  emitter.toConversation(conversation._id, 'conversation:updated', lite);

  res.json({ success: true, data: lite });
});

/** POST /api/conversations/:id/resolve */
const resolveConversation = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);
  if (!conversation) throw ApiError.notFound('Conversation not found');
  await assertAccess(req, conversation);

  conversation.status = CONVERSATION_STATUS.RESOLVED;
  conversation.resolvedAt = new Date();
  conversation.resolvedBy = req.user._id;
  conversation.resolvedByType = 'agent';
  await conversation.save();

  await support.addMessage({
    conversation,
    senderType: SENDER_TYPE.SYSTEM,
    senderName: 'System',
    content: `${req.user.name} marked this conversation as resolved.`,
    messageType: MESSAGE_TYPE.SYSTEM,
  });

  AnalyticsEvent.track({
    type: AnalyticsEvent.EVENTS.HUMAN_RESOLVED,
    productId: conversation.productId,
    customerId: conversation.customerId,
    conversationId: conversation._id,
    agentId: req.user._id,
    value: conversation.firstCustomerMessageAt
      ? Math.round((conversation.resolvedAt - conversation.firstCustomerMessageAt) / 1000)
      : 0,
  });

  const lite = support.serializeConversationLite(conversation);
  emitter.toAgents('conversation:resolved', lite);
  emitter.toConversation(conversation._id, 'conversation:resolved', lite);

  res.json({ success: true, data: lite });
});

/** POST /api/conversations/:id/reopen */
const reopenConversation = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);
  if (!conversation) throw ApiError.notFound('Conversation not found');
  await assertAccess(req, conversation);

  conversation.status = CONVERSATION_STATUS.ACTIVE;
  conversation.resolvedAt = null;
  conversation.closedAt = null;
  conversation.reopenedCount += 1;
  await conversation.save();

  await support.addMessage({
    conversation,
    senderType: SENDER_TYPE.SYSTEM,
    senderName: 'System',
    content: `${req.user.name} reopened this conversation.`,
    messageType: MESSAGE_TYPE.SYSTEM,
  });

  const lite = support.serializeConversationLite(conversation);
  emitter.toAgents('conversation:updated', lite);
  res.json({ success: true, data: lite });
});

/** POST /api/conversations/:id/summarize — regenerate the AI brief on demand. */
const summarize = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id).populate('productId', 'name').populate('customerId', 'name email');
  if (!conversation) throw ApiError.notFound('Conversation not found');
  await assertAccess(req, conversation);

  const messages = await Message.find({ conversationId: conversation._id, isInternal: false })
    .sort({ createdAt: 1 })
    .lean();

  const summary = await gemini.summarizeConversation({
    messages,
    intent: conversation.detectedIntent,
    customerName: conversation.customerId?.name || conversation.customerId?.email || 'Anonymous visitor',
    productName: conversation.productId?.name || '',
  });

  conversation.aiSummary = summary.summary;
  conversation.aiSummaryGeneratedAt = new Date();
  conversation.aiSuggestedTeam = summary.suggestedTeam;
  await conversation.save();

  res.json({ success: true, data: summary });
});

/**
 * POST /api/conversations/:id/suggest-reply
 * Returns a draft only. Nothing is sent until the agent presses Send.
 */
const suggestReply = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id).populate('productId');
  if (!conversation) throw ApiError.notFound('Conversation not found');
  await assertAccess(req, conversation);

  const messages = await Message.find({ conversationId: conversation._id, isInternal: false })
    .sort({ createdAt: 1 })
    .limit(40)
    .lean();

  const lastCustomer = [...messages].reverse().find((m) => m.senderType === SENDER_TYPE.CUSTOMER);
  const question = lastCustomer?.content || conversation.subject || '';

  const { chunks } = await rag.retrieve({ productId: conversation.productId._id, question });
  const knowledge = rag.buildContext(chunks, 6000);

  const verifiedData = await require('../services/support/verifiedData').getVerifiedAccountData({
    customerId: conversation.customerId,
    productId: conversation.productId._id,
  });

  const suggestion = await gemini.suggestReply({
    product: conversation.productId,
    messages,
    knowledge,
    verifiedData,
    agentName: req.user.name,
  });

  res.json({ success: true, data: suggestion });
});

/** GET /api/conversations/:id/messages — pagination for long threads. */
const listMessages = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);
  if (!conversation) throw ApiError.notFound('Conversation not found');
  await assertAccess(req, conversation);

  const before = req.query.before ? { createdAt: { $lt: new Date(req.query.before) } } : {};
  const messages = await Message.find({ conversationId: conversation._id, ...before })
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(req.query.limit) || 50, 200))
    .lean();

  res.json({ success: true, data: messages.reverse().map((m) => support.serializeMessage(m)) });
});

module.exports = {
  listConversations,
  listCounts,
  getConversation,
  listMessages,
  sendMessage,
  assignConversation,
  transferConversation,
  updateConversation,
  resolveConversation,
  reopenConversation,
  summarize,
  suggestReply,
};
