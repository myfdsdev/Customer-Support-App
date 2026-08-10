import { newClientMessageId } from '../socket/socket';

/**
 * Message-list reconciliation shared by the agent inbox and the customer chat.
 *
 * Both surfaces receive the same message from two directions — the socket
 * acknowledgement and the `message:new` broadcast — plus their own optimistic
 * copy. All three collapse onto one entry here, keyed by `clientMessageId`
 * first and `_id` second, so no screen ever shows a duplicate bubble.
 */

export { newClientMessageId };

/** The bubble rendered before the server has confirmed anything. */
export function createOptimisticMessage({
  senderType,
  senderId = null,
  senderName = '',
  content,
  conversationId,
  isInternal = false,
  messageType = 'text',
}) {
  const clientMessageId = newClientMessageId();
  return {
    _id: `temp_${clientMessageId}`,
    clientMessageId,
    conversationId: conversationId ? String(conversationId) : null,
    senderType,
    senderId: senderId ? String(senderId) : null,
    senderName,
    content,
    messageType,
    isInternal,
    ai: null,
    readAt: null,
    createdAt: new Date().toISOString(),
    pending: true,
    failed: false,
  };
}

const sameMessage = (a, b) => {
  if (!a || !b) return false;
  if (a.clientMessageId && b.clientMessageId && a.clientMessageId === b.clientMessageId) return true;
  return Boolean(a._id) && Boolean(b._id) && String(a._id) === String(b._id);
};

/**
 * Inserts or replaces a message.
 *
 * A confirmed message replaces its optimistic twin in place, so the bubble
 * never jumps position when the server responds.
 */
export function upsertMessage(list = [], incoming) {
  if (!incoming) return list;
  const index = list.findIndex((m) => sameMessage(m, incoming));

  if (index === -1) {
    return [...list, { ...incoming, pending: false, failed: false }];
  }

  const next = [...list];
  next[index] = {
    ...next[index],
    ...incoming,
    // Keep the original optimistic timestamp: the server's createdAt can be a
    // few ms later, which would otherwise reorder a fast exchange.
    createdAt: next[index].pending ? next[index].createdAt : incoming.createdAt || next[index].createdAt,
    pending: false,
    failed: false,
  };
  return next;
}

/** Bulk version used after a reconnect sync. */
export function mergeMessages(list = [], incoming = []) {
  return incoming.reduce((acc, m) => upsertMessage(acc, m), list);
}

export function markMessageFailed(list = [], clientMessageId, error = '') {
  return list.map((m) =>
    m.clientMessageId === clientMessageId ? { ...m, pending: false, failed: true, error } : m
  );
}

export function markMessageSending(list = [], clientMessageId) {
  return list.map((m) =>
    m.clientMessageId === clientMessageId ? { ...m, pending: true, failed: false, error: '' } : m
  );
}

export function removeMessage(list = [], clientMessageId) {
  return list.filter((m) => m.clientMessageId !== clientMessageId);
}

export const hasMessage = (list = [], incoming) => list.some((m) => sameMessage(m, incoming));
