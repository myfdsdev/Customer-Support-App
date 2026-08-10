'use strict';

const {
  Conversation,
  Message,
  Customer,
  CustomerSession,
  AnalyticsEvent,
} = require('../../models');
const {
  CONVERSATION_STATUS,
  SENDER_TYPE,
  MESSAGE_TYPE,
  OPEN_STATUSES,
} = require('../../utils/constants');
const { truncate, toPlain } = require('../../utils/text');
const emitter = require('../socket/emitter');

/**
 * Shared conversation/message plumbing used by both the public support API and
 * the agent inbox, so a message created over REST and one created over a
 * socket behave identically (same counters, same broadcasts).
 */

/** Finds the customer's live conversation for a product, or starts one. */
async function getOrCreateConversation({ customerId, productId, sessionId }) {
  let conversation = await Conversation.findOne({
    customerId,
    productId,
    status: { $in: OPEN_STATUSES },
  }).sort({ lastMessageAt: -1 });

  if (conversation) {
    if (sessionId && String(conversation.sessionId) !== String(sessionId)) {
      conversation.sessionId = sessionId;
      await conversation.save();
    }
    return { conversation, created: false };
  }

  conversation = await Conversation.create({
    customerId,
    productId,
    sessionId: sessionId || null,
    status: CONVERSATION_STATUS.NEW,
    channel: 'ai',
    lastMessageAt: new Date(),
  });

  await Customer.updateOne({ _id: customerId }, { $inc: { 'stats.conversations': 1 } }).catch(() => null);
  if (sessionId) {
    await CustomerSession.updateOne({ _id: sessionId }, { $set: { currentConversationId: conversation._id } }).catch(
      () => null
    );
  }

  AnalyticsEvent.track({
    type: AnalyticsEvent.EVENTS.CONVERSATION_STARTED,
    productId,
    customerId,
    conversationId: conversation._id,
  });

  return { conversation, created: true };
}

/**
 * Persists a message, updates denormalised conversation state, and broadcasts.
 * `broadcast: false` lets a caller batch several writes and emit once.
 */
async function addMessage({
  conversation,
  senderType,
  senderId = null,
  senderName = '',
  content,
  messageType = MESSAGE_TYPE.TEXT,
  isInternal = false,
  attachment = null,
  ai = null,
  broadcast = true,
}) {
  const message = await Message.create({
    conversationId: conversation._id,
    productId: conversation.productId,
    senderType,
    senderId,
    senderName,
    content,
    messageType,
    isInternal,
    ...(attachment
      ? {
          attachmentUrl: attachment.url,
          attachmentName: attachment.name,
          attachmentType: attachment.type,
          attachmentSize: attachment.size,
        }
      : {}),
    ...(ai ? { ai } : {}),
  });

  if (!isInternal) {
    const update = {
      $set: {
        lastMessageAt: message.createdAt,
        lastMessagePreview: truncate(toPlain(content) || (attachment ? attachment.name : ''), 140),
        lastMessageSender: senderType,
      },
      $inc: { messageCount: 1 },
    };

    if (senderType === SENDER_TYPE.CUSTOMER) {
      update.$inc.unreadForAgent = 1;
      if (!conversation.firstCustomerMessageAt) update.$set.firstCustomerMessageAt = message.createdAt;
    } else if (senderType === SENDER_TYPE.AGENT) {
      update.$inc.unreadForCustomer = 1;
      update.$inc.agentMessageCount = 1;
      if (!conversation.firstAgentReplyAt) update.$set.firstAgentReplyAt = message.createdAt;
      // An agent replying to a waiting chat puts the ball back with the customer.
      if (conversation.status === CONVERSATION_STATUS.WAITING_TEAM) {
        update.$set.status = CONVERSATION_STATUS.ACTIVE;
      }
    } else if (senderType === SENDER_TYPE.AI) {
      update.$inc.unreadForCustomer = 1;
      update.$inc.aiMessageCount = 1;
    }

    const updated = await Conversation.findByIdAndUpdate(conversation._id, update, { new: true });
    if (updated) Object.assign(conversation, updated.toObject());
  }

  if (broadcast) {
    const payload = serializeMessage(message);
    emitter.toConversation(conversation._id, 'message:new', payload);
    // Internal notes must never leave the staff rooms.
    if (isInternal) {
      emitter.toAgents('message:internal', { conversationId: String(conversation._id), message: payload });
    }
    emitter.toAgents('conversation:updated', serializeConversationLite(conversation));
  }

  return message;
}

function serializeMessage(m) {
  const obj = m.toObject ? m.toObject() : m;
  return {
    _id: String(obj._id),
    conversationId: String(obj.conversationId),
    senderType: obj.senderType,
    senderId: obj.senderId ? String(obj.senderId) : null,
    senderName: obj.senderName || '',
    content: obj.content,
    messageType: obj.messageType,
    attachmentUrl: obj.attachmentUrl || '',
    attachmentName: obj.attachmentName || '',
    attachmentType: obj.attachmentType || '',
    attachmentSize: obj.attachmentSize || 0,
    isInternal: Boolean(obj.isInternal),
    ai: obj.ai || null,
    readAt: obj.readAt || null,
    createdAt: obj.createdAt,
  };
}

function serializeConversationLite(c) {
  const obj = c.toObject ? c.toObject() : c;
  return {
    _id: String(obj._id),
    customerId: String(obj.customerId),
    productId: String(obj.productId),
    assignedAgentId: obj.assignedAgentId ? String(obj.assignedAgentId) : null,
    status: obj.status,
    priority: obj.priority,
    channel: obj.channel,
    subject: obj.subject,
    tags: obj.tags || [],
    detectedIntent: obj.detectedIntent,
    handoffRequested: obj.handoffRequested,
    lastMessageAt: obj.lastMessageAt,
    lastMessagePreview: obj.lastMessagePreview,
    lastMessageSender: obj.lastMessageSender,
    unreadForAgent: obj.unreadForAgent,
    messageCount: obj.messageCount,
    aiSummary: obj.aiSummary,
    resolvedAt: obj.resolvedAt,
    updatedAt: obj.updatedAt,
  };
}

/** Recent turns handed to the model as conversation context. */
async function getHistory(conversationId, limit = 12) {
  const messages = await Message.find({ conversationId, isInternal: false })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return messages
    .reverse()
    .map((m) => ({
      role: m.senderType === SENDER_TYPE.CUSTOMER ? 'customer' : m.senderType === SENDER_TYPE.AGENT ? 'agent' : 'assistant',
      content: toPlain(m.content).slice(0, 1200),
    }));
}

async function markReadByAgent(conversationId, agentId) {
  await Message.updateMany(
    { conversationId, senderType: SENDER_TYPE.CUSTOMER, readAt: null },
    { $set: { readAt: new Date() }, $addToSet: { readBy: agentId } }
  );
  await Conversation.updateOne({ _id: conversationId }, { $set: { unreadForAgent: 0 } });
  emitter.toConversation(conversationId, 'message:read', { conversationId: String(conversationId), by: 'agent' });
}

async function markReadByCustomer(conversationId) {
  await Message.updateMany(
    { conversationId, senderType: { $in: [SENDER_TYPE.AI, SENDER_TYPE.AGENT, SENDER_TYPE.SYSTEM] }, readAt: null, isInternal: false },
    { $set: { readAt: new Date() } }
  );
  await Conversation.updateOne({ _id: conversationId }, { $set: { unreadForCustomer: 0 } });
  emitter.toConversation(conversationId, 'message:read', { conversationId: String(conversationId), by: 'customer' });
}

module.exports = {
  getOrCreateConversation,
  addMessage,
  getHistory,
  serializeMessage,
  serializeConversationLite,
  markReadByAgent,
  markReadByCustomer,
};
