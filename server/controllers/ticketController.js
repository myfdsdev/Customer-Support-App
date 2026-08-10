'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Ticket, Conversation, Customer, User, AnalyticsEvent } = require('../models');
const support = require('../services/support');
const emitter = require('../services/socket/emitter');
const { accessibleProductIds } = require('../middleware/auth');
const {
  TICKET_STATUS,
  TICKET_STATUS_LIST,
  TICKET_OPEN_STATUSES,
  TICKET_CATEGORIES,
  PRIORITY_LIST,
  SENDER_TYPE,
  MESSAGE_TYPE,
} = require('../utils/constants');

/** GET /api/tickets */
const listTickets = asyncHandler(async (req, res) => {
  const { status, priority, category, productId, assigned, search, page = 1, limit = 50 } = req.query;

  const filter = {};
  const scope = await accessibleProductIds(req.user);
  if (scope) filter.productId = { $in: scope };
  if (productId) filter.productId = productId;
  if (status === 'open') filter.status = { $in: TICKET_OPEN_STATUSES };
  else if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (category) filter.category = category;
  if (assigned === 'mine') filter.assignedAgent = req.user._id;
  if (assigned === 'unassigned') filter.assignedAgent = null;
  if (search) filter.$or = [{ title: new RegExp(search, 'i') }, { ticketNumber: new RegExp(search, 'i') }];

  const skip = (Number(page) - 1) * Number(limit);
  const [tickets, total] = await Promise.all([
    Ticket.find(filter)
      .populate('customerId', 'name email')
      .populate('productId', 'name slug logo')
      .populate('assignedAgent', 'name avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Ticket.countDocuments(filter),
  ]);

  res.json({ success: true, data: tickets, meta: { total, page: Number(page), limit: Number(limit) } });
});

/** GET /api/tickets/:id */
const getTicket = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findById(req.params.id)
    .populate('customerId')
    .populate('productId', 'name slug logo')
    .populate('assignedAgent', 'name email avatar')
    .populate('conversationId', 'status lastMessagePreview lastMessageAt aiSummary')
    .lean();
  if (!ticket) throw ApiError.notFound('Ticket not found');
  res.json({ success: true, data: ticket });
});

/**
 * POST /api/tickets
 * Tickets are the exception, not the default path — they exist for work that
 * needs investigation beyond the live chat.
 */
const createTicket = asyncHandler(async (req, res) => {
  const { customerId, productId, conversationId, title, description, category, priority, assignedTeam, assignedAgent } =
    req.body;

  if (!title) throw ApiError.badRequest('Title is required');

  let resolvedCustomerId = customerId;
  let resolvedProductId = productId;
  let conversation = null;

  if (conversationId) {
    conversation = await Conversation.findById(conversationId);
    if (!conversation) throw ApiError.notFound('Conversation not found');
    resolvedCustomerId = resolvedCustomerId || conversation.customerId;
    resolvedProductId = resolvedProductId || conversation.productId;
  }

  if (!resolvedCustomerId || !resolvedProductId) {
    throw ApiError.badRequest('customerId and productId are required (or a conversationId to derive them from)');
  }

  const ticket = await Ticket.create({
    customerId: resolvedCustomerId,
    productId: resolvedProductId,
    conversationId: conversationId || null,
    title,
    description: description || conversation?.aiSummary || '',
    category: TICKET_CATEGORIES.includes(category) ? category : 'Other',
    priority: PRIORITY_LIST.includes(priority) ? priority : conversation?.priority || 'normal',
    assignedTeam: assignedTeam || conversation?.aiSuggestedTeam || '',
    assignedAgent: assignedAgent || null,
    createdBy: req.user._id,
  });

  await Customer.updateOne({ _id: resolvedCustomerId }, { $inc: { 'stats.tickets': 1 } }).catch(() => null);

  // Leave a trace in the chat so the customer and agents see the ticket exists.
  if (conversation) {
    await support.addMessage({
      conversation,
      senderType: SENDER_TYPE.SYSTEM,
      senderName: 'System',
      content: `Ticket ${ticket.ticketNumber} created: ${ticket.title}`,
      messageType: MESSAGE_TYPE.SYSTEM,
    });
  }

  AnalyticsEvent.track({
    type: AnalyticsEvent.EVENTS.TICKET_CREATED,
    productId: resolvedProductId,
    customerId: resolvedCustomerId,
    conversationId: conversationId || null,
    agentId: req.user._id,
    refId: ticket._id,
    label: ticket.category,
  });

  emitter.toAgents('ticket:new', {
    _id: String(ticket._id),
    ticketNumber: ticket.ticketNumber,
    title: ticket.title,
    priority: ticket.priority,
    status: ticket.status,
  });

  res.status(201).json({ success: true, data: ticket });
});

/** PATCH /api/tickets/:id */
const updateTicket = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) throw ApiError.notFound('Ticket not found');

  const { title, description, category, priority, status, assignedTeam, assignedAgent, resolution } = req.body;

  if (title !== undefined) ticket.title = title;
  if (description !== undefined) ticket.description = description;
  if (category !== undefined && TICKET_CATEGORIES.includes(category)) ticket.category = category;
  if (priority !== undefined && PRIORITY_LIST.includes(priority)) ticket.priority = priority;
  if (assignedTeam !== undefined) ticket.assignedTeam = assignedTeam;
  if (assignedAgent !== undefined) ticket.assignedAgent = assignedAgent || null;
  if (resolution !== undefined) ticket.resolution = resolution;

  if (status !== undefined) {
    if (!TICKET_STATUS_LIST.includes(status)) throw ApiError.badRequest('Invalid ticket status');
    ticket.status = status;
    if (status === TICKET_STATUS.RESOLVED) ticket.resolvedAt = new Date();
    if (status === TICKET_STATUS.CLOSED) ticket.closedAt = new Date();
    if (TICKET_OPEN_STATUSES.includes(status)) {
      ticket.resolvedAt = null;
      ticket.closedAt = null;
    }
  }

  await ticket.save();
  emitter.toAgents('ticket:updated', { _id: String(ticket._id), status: ticket.status, priority: ticket.priority });
  res.json({ success: true, data: ticket });
});

/** POST /api/tickets/:id/notes */
const addTicketNote = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) throw ApiError.notFound('Ticket not found');
  const { note } = req.body;
  if (!note) throw ApiError.badRequest('Note cannot be empty');

  ticket.notes.push({ agentId: req.user._id, agentName: req.user.name, note });
  await ticket.save();
  res.status(201).json({ success: true, data: ticket.notes[ticket.notes.length - 1] });
});

/** DELETE /api/tickets/:id */
const deleteTicket = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findByIdAndDelete(req.params.id);
  if (!ticket) throw ApiError.notFound('Ticket not found');
  res.json({ success: true, message: `Ticket ${ticket.ticketNumber} deleted` });
});

/** GET /api/tickets/meta — dropdown options + counts. */
const ticketMeta = asyncHandler(async (req, res) => {
  const scope = await accessibleProductIds(req.user);
  const base = scope ? { productId: { $in: scope } } : {};
  const [open, mine, unassigned, agents] = await Promise.all([
    Ticket.countDocuments({ ...base, status: { $in: TICKET_OPEN_STATUSES } }),
    Ticket.countDocuments({ ...base, assignedAgent: req.user._id, status: { $in: TICKET_OPEN_STATUSES } }),
    Ticket.countDocuments({ ...base, assignedAgent: null, status: { $in: TICKET_OPEN_STATUSES } }),
    User.find({ status: 'active' }).select('name role').lean(),
  ]);

  res.json({
    success: true,
    data: {
      categories: TICKET_CATEGORIES,
      statuses: TICKET_STATUS_LIST,
      teams: require('../utils/constants').TEAMS,
      counts: { open, mine, unassigned },
      agents,
    },
  });
});

module.exports = { listTickets, getTicket, createTicket, updateTicket, addTicketNote, deleteTicket, ticketMeta };
