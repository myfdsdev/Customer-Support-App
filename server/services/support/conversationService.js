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

/**
 * Finds the customer's live conversation for a product, or starts one.
 *
 * `mode` is the support mode the customer has actually chosen in the UI:
 * 'ai' for /chat, 'human' for /live-support. It matters because the two must
 * not collide. Without it, a customer who once clicked "Talk to Support" was
 * permanently stuck: every later visit to "Ask AI Assistant" reused that
 * human conversation and their question went silently to the queue instead of
 * to the assistant.
 *
 * Resolution:
 *   mode 'ai'    → reuse an open AI conversation; if the only open one is with
 *                  a human, leave it completely alone and start a fresh AI
 *                  conversation alongside it.
 *   mode 'human' → prefer an open human conversation (resume the queue or the
 *                  agent), otherwise take the open AI one so a handoff carries
 *                  its history across.
 */
async function getOrCreateConversation({ customerId, productId, sessionId, mode = 'ai' }) {
  const open = await Conversation.find({
    customerId,
    productId,
    status: { $in: OPEN_STATUSES },
  })
    .sort({ lastMessageAt: -1 })
    .limit(10);

  const humanConversation = open.find((c) => c.channel === 'human');
  const aiConversation = open.find((c) => c.channel === 'ai');

  const conversation =
    mode === 'human' ? humanConversation || aiConversation || null : aiConversation || null;

  if (conversation) {
    if (sessionId && String(conversation.sessionId) !== String(sessionId)) {
      conversation.sessionId = sessionId;
      await conversation.save();
    }
    return { conversation, created: false, otherOpen: mode === 'ai' ? humanConversation || null : aiConversation || null };
  }

  const created = await createConversation({ customerId, productId, sessionId });
  return { ...created, otherOpen: mode === 'ai' ? humanConversation || null : aiConversation || null };
}

async function createConversation({ customerId, productId, sessionId }) {
  const conversation = await Conversation.create({
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
  clientMessageId = null,
  broadcast = true,
}) {
  let message;
  try {
    message = await Message.create({
      conversationId: conversation._id,
      productId: conversation.productId,
      senderType,
      senderId,
      senderName,
      content,
      messageType,
      isInternal,
      clientMessageId: clientMessageId || null,
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
  } catch (err) {
    // Duplicate clientMessageId: this exact send already landed (socket retry,
    // reconnect replay, double-click). Return the stored message so the caller
    // can acknowledge normally, and skip the counters and the broadcast — the
    // first attempt already did both.
    if (err.code === 11000 && clientMessageId) {
      const existing = await Message.findOne({ conversationId: conversation._id, clientMessageId });
      if (existing) {
        existing.$wasDuplicate = true;
        return existing;
      }
    }
    throw err;
  }

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

  if (broadcast && !message.$wasDuplicate) {
    const payload = serializeMessage(message);

    if (isInternal) {
      // Never touch the conversation room — the customer's socket is in it.
      // Internal notes go to staff rooms only.
      emitter.toAgents('message:internal', { conversationId: String(conversation._id), message: payload });
    } else {
      emitter.toConversation(conversation._id, 'message:new', payload);
    }
    // `activity` (not `updated`) on purpose: this carries everything an inbox
    // row needs to repaint itself, so the client patches in place instead of
    // refetching the list. `conversation:updated` stays reserved for changes
    // that can move a conversation between filters.
    emitter.toAgents('conversation:activity', {
      ...serializeConversationLite(conversation),
      message: payload,
    });
  }

  return message;
}

function serializeMessage(m) {
  const obj = m.toObject ? m.toObject() : m;
  return {
    _id: String(obj._id),
    conversationId: String(obj.conversationId),
    // Echoed back so the sender can swap its optimistic bubble in place, and
    // so every client can drop a message it has already rendered.
    clientMessageId: obj.clientMessageId || null,
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
