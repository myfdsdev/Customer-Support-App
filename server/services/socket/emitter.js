'use strict';

/**
 * Thin indirection over the Socket.io server instance.
 *
 * Controllers and services emit through here instead of importing the socket
 * module directly, which keeps the dependency graph acyclic and makes every
 * REST mutation broadcast the same events the socket handlers do.
 */

let io = null;

function setIO(instance) {
  io = instance;
}

const rooms = {
  product: (productId) => `product:${productId}`,
  conversation: (conversationId) => `conversation:${conversationId}`,
  agent: (agentId) => `agent:${agentId}`,
  allAgents: () => 'agents:all',
  session: (sessionId) => `session:${sessionId}`,
};

function emit(room, event, payload) {
  if (!io) return;
  io.to(room).emit(event, payload);
}

function toConversation(conversationId, event, payload) {
  emit(rooms.conversation(conversationId), event, payload);
}

/** Everything an agent needs to see live: new chats, presence, assignments. */
function toAgents(event, payload) {
  emit(rooms.allAgents(), event, payload);
}

function toAgent(agentId, event, payload) {
  emit(rooms.agent(agentId), event, payload);
}

function toProduct(productId, event, payload) {
  emit(rooms.product(productId), event, payload);
}

function toSession(sessionId, event, payload) {
  emit(rooms.session(sessionId), event, payload);
}

function getIO() {
  return io;
}

module.exports = { setIO, getIO, rooms, emit, toConversation, toAgents, toAgent, toProduct, toSession };
