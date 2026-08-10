'use strict';

const { Server } = require('socket.io');
const env = require('../config/env');
const logger = require('../utils/logger');
const { authenticateSocket } = require('./socketAuth');
const emitter = require('../services/socket/emitter');
const presence = require('../services/support/presenceService');
const support = require('../services/support');
const { Conversation, Customer, Product, ProductAgent } = require('../models');
const { SENDER_TYPE, CONVERSATION_STATUS, OPEN_STATUSES, GLOBAL_ROLES } = require('../utils/constants');

/**
 * Realtime layer.
 *
 * Room model:
 *   product:{id}        every visitor + watching agents for one product
 *   conversation:{id}   the two (or three) parties in one chat
 *   agent:{id}          direct-to-agent notifications
 *   agents:all          the shared inbox feed
 *   session:{id}        one browser tab
 */
function initSockets(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.clientUrl.split(',').map((s) => s.trim()),
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 20000,
    maxHttpBufferSize: 1e6,
  });

  emitter.setIO(io);
  io.use(authenticateSocket);

  io.on('connection', async (socket) => {
    const d = socket.data;

    // Handlers are registered synchronously, BEFORE any awaited setup.
    // Socket.io does not buffer events for listeners attached later, so a
    // client that emits the instant it connects — which is exactly what a
    // reconnect does — would otherwise have that first event dropped while
    // the presence writes below were still in flight.
    registerConversationHandlers(socket);
    registerTypingHandlers(socket);
    registerPresenceHandlers(socket);
    registerMessageHandlers(socket);

    if (d.kind === 'agent') await onAgentConnected(socket);
    else await onCustomerConnected(socket);

    socket.on('disconnect', async (reason) => {
      try {
        if (d.kind === 'customer') {
          await presence.detachSocket(d.sessionId, socket.id);
        } else {
          // Only mark an agent offline once their last tab closes.
          const remaining = await io.in(emitter.rooms.agent(d.agentId)).fetchSockets();
          if (!remaining.length) await presence.setAgentPresence(d.agentId, false);
        }
      } catch (err) {
        logger.error('Socket disconnect handling failed:', err.message);
      }
      logger.debug(`Socket disconnected (${d.kind}) ${socket.id}: ${reason}`);
    });
  });

  // Presence is heartbeat-derived, so stale sessions need periodic reaping.
  const sweeper = setInterval(() => {
    presence.sweepStaleSessions().catch((err) => logger.error('Presence sweep failed:', err.message));
  }, 60 * 1000);
  sweeper.unref?.();

  logger.info('Socket.io ready');
  return io;
}

// --- connection setup -------------------------------------------------------

async function onAgentConnected(socket) {
  const { agentId, name } = socket.data;

  socket.join(emitter.rooms.allAgents());
  socket.join(emitter.rooms.agent(agentId));

  // Watch the products this agent is responsible for (all, for global roles).
  if (GLOBAL_ROLES.includes(socket.data.role)) {
    const products = await Product.find({ active: true }).select('_id').lean();
    products.forEach((p) => socket.join(emitter.rooms.product(p._id)));
  } else {
    const links = await ProductAgent.find({ agentId }).select('productId').lean();
    links.forEach((l) => socket.join(emitter.rooms.product(l.productId)));
  }

  await presence.setAgentPresence(agentId, true);
  socket.emit('agent:ready', { agentId, name });
  logger.debug(`Agent connected: ${name} (${socket.id})`);
}

async function onCustomerConnected(socket) {
  const { sessionId, productId, customerId } = socket.data;

  socket.join(emitter.rooms.session(sessionId));
  socket.join(emitter.rooms.product(productId));

  await presence.attachSocket(sessionId, socket.id);

  // Rejoin an in-flight conversation so a page refresh does not drop the chat.
  const conversation = await Conversation.findOne({
    customerId,
    productId,
    status: { $in: OPEN_STATUSES },
  })
    .sort({ lastMessageAt: -1 })
    .select('_id status channel');

  if (conversation) socket.join(emitter.rooms.conversation(conversation._id));

  socket.emit('customer:ready', {
    sessionId,
    conversationId: conversation ? String(conversation._id) : null,
    status: conversation?.status || null,
  });

  emitter.toAgents('customer:online', { sessionId, customerId, productId });
}

// --- handlers ---------------------------------------------------------------

/** Confirms the socket may join/act on a conversation. */
async function authorizeConversation(socket, conversationId) {
  const conversation = await Conversation.findById(conversationId).select(
    'customerId productId assignedAgentId status channel'
  );
  if (!conversation) return null;

  if (socket.data.kind === 'customer') {
    // A customer may only ever touch their own conversation on their product.
    if (String(conversation.customerId) !== String(socket.data.customerId)) return null;
    if (String(conversation.productId) !== String(socket.data.productId)) return null;
    return conversation;
  }

  if (GLOBAL_ROLES.includes(socket.data.role)) return conversation;

  const links = await ProductAgent.countDocuments({ agentId: socket.data.agentId });
  if (links === 0) return conversation; // no assignments configured yet
  const allowed = await ProductAgent.exists({ agentId: socket.data.agentId, productId: conversation.productId });
  return allowed ? conversation : null;
}

function registerConversationHandlers(socket) {
  socket.on('conversation:join', async ({ conversationId } = {}, ack) => {
    const conversation = await authorizeConversation(socket, conversationId);
    if (!conversation) return ack?.({ ok: false, error: 'Not allowed' });

    socket.join(emitter.rooms.conversation(conversation._id));

    if (socket.data.kind === 'agent') {
      await support.markReadByAgent(conversation._id, socket.data.agentId);
      emitter.toConversation(conversation._id, 'agent:viewing', {
        conversationId: String(conversation._id),
        agentId: socket.data.agentId,
        name: socket.data.name,
      });
    } else {
      await support.markReadByCustomer(conversation._id);
    }

    return ack?.({ ok: true, conversationId: String(conversation._id) });
  });

  socket.on('conversation:leave', ({ conversationId } = {}) => {
    if (!conversationId) return;
    socket.leave(emitter.rooms.conversation(conversationId));
  });

  socket.on('message:read', async ({ conversationId } = {}) => {
    const conversation = await authorizeConversation(socket, conversationId);
    if (!conversation) return;
    if (socket.data.kind === 'agent') await support.markReadByAgent(conversation._id, socket.data.agentId);
    else await support.markReadByCustomer(conversation._id);
  });
}

function registerTypingHandlers(socket) {
  const relay = (event) => async ({ conversationId } = {}) => {
    if (!conversationId) return;
    const conversation = await authorizeConversation(socket, conversationId);
    if (!conversation) return;

    socket.to(emitter.rooms.conversation(conversationId)).emit(event, {
      conversationId: String(conversationId),
      who: socket.data.kind,
      name: socket.data.kind === 'agent' ? socket.data.name : 'Customer',
    });
  };

  socket.on('typing:start', relay('typing:start'));
  socket.on('typing:stop', relay('typing:stop'));
}

function registerPresenceHandlers(socket) {
  socket.on('presence:heartbeat', async ({ currentPage, presenceStatus } = {}) => {
    if (socket.data.kind !== 'customer') return;
    await presence.heartbeat({ sessionId: socket.data.sessionId, currentPage, presenceStatus });
  });

  socket.on('customer:offline', async () => {
    if (socket.data.kind !== 'customer') return;
    await presence.endSession(socket.data.sessionId);
  });

  socket.on('agent:online', async () => {
    if (socket.data.kind !== 'agent') return;
    await presence.setAgentPresence(socket.data.agentId, true);
  });

  socket.on('agent:offline', async () => {
    if (socket.data.kind !== 'agent') return;
    await presence.setAgentPresence(socket.data.agentId, false);
  });
}

/**
 * `message:send` is the realtime write path. It performs the same validation,
 * persistence and broadcasting as the REST endpoints — a socket is never a
 * shortcut around authorization.
 */
function registerMessageHandlers(socket) {
  socket.on('message:send', async (payload = {}, ack) => {
    const clientMessageId = payload.clientMessageId ? String(payload.clientMessageId).slice(0, 64) : null;
    try {
      const { conversationId, content, isInternal } = payload;
      const text = String(content || '').trim();
      if (!text) return ack?.({ ok: false, error: 'Message cannot be empty', clientMessageId });
      if (text.length > 4000) return ack?.({ ok: false, error: 'Message is too long', clientMessageId });

      const authorized = await authorizeConversation(socket, conversationId);
      if (!authorized) return ack?.({ ok: false, error: 'Not allowed', clientMessageId });

      const conversation = await Conversation.findById(conversationId);
      if (!conversation) return ack?.({ ok: false, error: 'Conversation not found', clientMessageId });

      if (socket.data.kind === 'agent') {
        if (!conversation.assignedAgentId && !isInternal) {
          conversation.assignedAgentId = socket.data.agentId;
          conversation.channel = 'human';
          conversation.status = CONVERSATION_STATUS.ACTIVE;
          await conversation.save();
          emitter.toAgents('conversation:assigned', {
            conversationId: String(conversation._id),
            agentId: socket.data.agentId,
            agentName: socket.data.name,
          });
        }

        const message = await support.addMessage({
          conversation,
          senderType: SENDER_TYPE.AGENT,
          senderId: socket.data.agentId,
          senderName: socket.data.name,
          content: text,
          isInternal: Boolean(isInternal),
          clientMessageId,
        });

        // CRM counters do not affect message correctness, so they must not sit
        // between the save and the acknowledgement the sender is waiting on.
        if (!isInternal && !message.$wasDuplicate) {
          Customer.updateOne(
            { _id: conversation.customerId },
            { $inc: { 'stats.humanInteractions': 1 }, $set: { lastContactAt: new Date() } }
          ).catch(() => null);
        }

        return ack?.({ ok: true, clientMessageId, message: support.serializeMessage(message) });
      }

      // Customer side.
      const customer = await Customer.findById(socket.data.customerId);
      if (!customer) return ack?.({ ok: false, error: 'Customer session invalid', clientMessageId });

      if (conversation.channel === 'human') {
        const message = await support.addMessage({
          conversation,
          senderType: SENDER_TYPE.CUSTOMER,
          senderId: customer._id,
          senderName: customer.name || 'Customer',
          content: text,
          clientMessageId,
        });
        if (!message.$wasDuplicate) {
          Conversation.updateOne(
            { _id: conversation._id },
            { $set: { status: CONVERSATION_STATUS.WAITING_TEAM } }
          ).catch(() => null);
        }
        return ack?.({ ok: true, mode: 'human', clientMessageId, message: support.serializeMessage(message) });
      }

      // AI turn. Acknowledge as soon as the customer's own message is durable —
      // they should not watch a spinner on their own bubble while Gemini thinks.
      const product = await Product.findById(conversation.productId);
      socket.emit('ai:thinking', { conversationId: String(conversation._id) });

      const result = await support.handleCustomerMessage({
        product,
        conversation,
        customer,
        content: text,
        clientMessageId,
        onCustomerMessage: (saved) =>
          ack?.({ ok: true, mode: 'ai', clientMessageId, message: support.serializeMessage(saved) }),
      });

      socket.emit('ai:done', { conversationId: String(conversation._id), ...result });
      return undefined;
    } catch (err) {
      logger.error('message:send failed:', err.message);
      return ack?.({ ok: false, error: 'Could not send message', clientMessageId });
    }
  });

  socket.on('conversation:handoff', async ({ conversationId, reason } = {}, ack) => {
    try {
      if (socket.data.kind !== 'customer') return ack?.({ ok: false, error: 'Not allowed' });
      const authorized = await authorizeConversation(socket, conversationId);
      if (!authorized) return ack?.({ ok: false, error: 'Not allowed' });

      const conversation = await Conversation.findById(conversationId);
      const product = await Product.findById(conversation.productId);
      const customer = await Customer.findById(socket.data.customerId);

      const result = await support.requestHumanHandoff({
        product,
        conversation,
        customer,
        reason: reason || 'Customer requested human support',
        intent: conversation.detectedIntent,
      });

      return ack?.({ ok: true, ...result });
    } catch (err) {
      logger.error('conversation:handoff failed:', err.message);
      return ack?.({ ok: false, error: 'Could not transfer to support' });
    }
  });
}

module.exports = { initSockets };
