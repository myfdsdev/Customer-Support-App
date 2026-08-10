'use strict';

const { CustomerSession, Customer, Product, User } = require('../../models');
const { PRESENCE } = require('../../utils/constants');
const { newAnonymousId, hashIp } = require('../../utils/tokens');
const emitter = require('../socket/emitter');

/**
 * Customer presence.
 *
 * Deliberately approximate: presence is derived from heartbeat recency rather
 * than trusted socket state, because sockets die without telling anyone.
 * Anything older than AWAY_AFTER is downgraded on read, and a sweeper closes
 * sessions that have gone quiet entirely.
 */

const AWAY_AFTER_MS = 60 * 1000;
const OFFLINE_AFTER_MS = 5 * 60 * 1000;

/**
 * Recency wins over the stored flag in one direction only: a stale session is
 * downgraded no matter what it last reported, but a fresh "away" heartbeat
 * (backgrounded tab) is respected rather than upgraded back to online.
 */
function derivePresence(lastSeenAt, endedAt, storedStatus) {
  if (endedAt) return PRESENCE.OFFLINE;
  const idle = Date.now() - new Date(lastSeenAt).getTime();
  if (idle < AWAY_AFTER_MS) return storedStatus === PRESENCE.AWAY ? PRESENCE.AWAY : PRESENCE.ONLINE;
  if (idle < OFFLINE_AFTER_MS) return PRESENCE.AWAY;
  return PRESENCE.OFFLINE;
}

/**
 * Starts or resumes a visitor session on a product support page.
 * An anonymous visitor gets a Customer record immediately so the agent has
 * something to attach notes and history to.
 */
async function startSession({ product, anonymousId, currentPage = '', userAgent = '', ip = '', referrer = '' }) {
  const anonId = anonymousId || newAnonymousId();

  let customer = await Customer.findOne({ anonymousIds: anonId });
  if (!customer) {
    customer = await Customer.create({
      anonymousIds: [anonId],
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      presenceStatus: PRESENCE.ONLINE,
    });
  } else {
    customer.lastSeenAt = new Date();
    customer.presenceStatus = PRESENCE.ONLINE;
    await customer.save();
  }

  // Reuse a recent open session for the same browser+product instead of
  // spawning a new row on every page navigation.
  let session = await CustomerSession.findOne({
    anonymousId: anonId,
    productId: product._id,
    endedAt: null,
  }).sort({ lastSeenAt: -1 });

  if (session) {
    session.customerId = customer._id;
    session.presenceStatus = PRESENCE.ONLINE;
    session.currentPage = currentPage || session.currentPage;
    session.lastSeenAt = new Date();
    await session.save();
  } else {
    session = await CustomerSession.create({
      customerId: customer._id,
      anonymousId: anonId,
      productId: product._id,
      presenceStatus: PRESENCE.ONLINE,
      currentPage,
      userAgent: String(userAgent).slice(0, 300),
      ipHash: ip ? hashIp(ip) : '',
      referrer: String(referrer).slice(0, 300),
      startedAt: new Date(),
      lastSeenAt: new Date(),
    });
  }

  broadcastPresence({ session, customer, product });
  return { session, customer, anonymousId: anonId };
}

/** Heartbeat: refresh lastSeen and (optionally) the page the visitor is on. */
async function heartbeat({ sessionId, currentPage, presenceStatus }) {
  const update = { lastSeenAt: new Date() };
  if (currentPage) update.currentPage = currentPage;
  if (presenceStatus && Object.values(PRESENCE).includes(presenceStatus)) update.presenceStatus = presenceStatus;
  else update.presenceStatus = PRESENCE.ONLINE;

  const session = await CustomerSession.findByIdAndUpdate(sessionId, { $set: update }, { new: true });
  if (!session) return null;

  await Customer.updateOne(
    { _id: session.customerId },
    { $set: { lastSeenAt: new Date(), presenceStatus: update.presenceStatus } }
  ).catch(() => null);

  broadcastPresence({ session });
  return session;
}

async function attachSocket(sessionId, socketId) {
  return CustomerSession.findByIdAndUpdate(
    sessionId,
    { $addToSet: { socketIds: socketId }, $set: { presenceStatus: PRESENCE.ONLINE, lastSeenAt: new Date() } },
    { new: true }
  );
}

async function detachSocket(sessionId, socketId) {
  const session = await CustomerSession.findByIdAndUpdate(
    sessionId,
    { $pull: { socketIds: socketId }, $set: { lastSeenAt: new Date() } },
    { new: true }
  );
  if (!session) return null;

  if (!session.socketIds.length) {
    session.presenceStatus = PRESENCE.OFFLINE;
    await session.save();
    await Customer.updateOne(
      { _id: session.customerId },
      { $set: { presenceStatus: PRESENCE.OFFLINE, lastSeenAt: new Date() } }
    ).catch(() => null);
  }

  broadcastPresence({ session });
  return session;
}

async function endSession(sessionId) {
  const session = await CustomerSession.findByIdAndUpdate(
    sessionId,
    { $set: { endedAt: new Date(), presenceStatus: PRESENCE.OFFLINE, socketIds: [] } },
    { new: true }
  );
  if (session) broadcastPresence({ session });
  return session;
}

function broadcastPresence({ session, customer, product }) {
  if (!session) return;
  const payload = {
    sessionId: String(session._id),
    customerId: session.customerId ? String(session.customerId) : null,
    productId: String(session.productId),
    presenceStatus: derivePresence(session.lastSeenAt, session.endedAt, session.presenceStatus),
    currentPage: session.currentPage,
    lastSeenAt: session.lastSeenAt,
    startedAt: session.startedAt,
    conversationId: session.currentConversationId ? String(session.currentConversationId) : null,
    ...(customer ? { customerName: customer.name || '', customerEmail: customer.email || '' } : {}),
    ...(product ? { productName: product.name, productSlug: product.slug } : {}),
  };
  emitter.toAgents('presence:update', payload);
  emitter.toProduct(session.productId, 'presence:update', payload);
}

/** Live sessions for the admin dashboard / customer panel. */
async function listOnline({ productId = null, limit = 100 } = {}) {
  const since = new Date(Date.now() - OFFLINE_AFTER_MS);
  const filter = { endedAt: null, lastSeenAt: { $gte: since } };
  if (productId) filter.productId = productId;

  const sessions = await CustomerSession.find(filter)
    .populate('customerId', 'name email phone tags')
    .populate('productId', 'name slug logo')
    .sort({ lastSeenAt: -1 })
    .limit(limit)
    .lean();

  return sessions.map((s) => ({
    ...s,
    presenceStatus: derivePresence(s.lastSeenAt, s.endedAt, s.presenceStatus),
    durationSeconds: Math.max(0, Math.round((Date.now() - new Date(s.startedAt).getTime()) / 1000)),
  }));
}

async function getCustomerPresence(customerId) {
  const session = await CustomerSession.findOne({ customerId, endedAt: null })
    .sort({ lastSeenAt: -1 })
    .populate('productId', 'name slug')
    .lean();

  if (!session) {
    const customer = await Customer.findById(customerId).select('lastSeenAt').lean();
    return { presenceStatus: PRESENCE.OFFLINE, lastSeenAt: customer?.lastSeenAt || null, currentPage: '', product: null };
  }

  return {
    presenceStatus: derivePresence(session.lastSeenAt, session.endedAt, session.presenceStatus),
    lastSeenAt: session.lastSeenAt,
    currentPage: session.currentPage,
    startedAt: session.startedAt,
    durationSeconds: Math.max(0, Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000)),
    product: session.productId || null,
  };
}

/**
 * Closes sessions that stopped heart-beating. Without this, a browser killed
 * mid-session would show "online" forever.
 */
async function sweepStaleSessions() {
  const cutoff = new Date(Date.now() - OFFLINE_AFTER_MS * 2);
  const stale = await CustomerSession.find({ endedAt: null, lastSeenAt: { $lt: cutoff } }).select('_id customerId');
  if (!stale.length) return 0;

  await CustomerSession.updateMany(
    { _id: { $in: stale.map((s) => s._id) } },
    { $set: { endedAt: new Date(), presenceStatus: PRESENCE.OFFLINE, socketIds: [] } }
  );
  await Customer.updateMany(
    { _id: { $in: stale.map((s) => s.customerId).filter(Boolean) } },
    { $set: { presenceStatus: PRESENCE.OFFLINE } }
  );

  stale.forEach((s) =>
    emitter.toAgents('presence:update', { sessionId: String(s._id), presenceStatus: PRESENCE.OFFLINE })
  );
  return stale.length;
}

/** Agent presence — separate from customers, keyed off the User record. */
async function setAgentPresence(agentId, isOnline) {
  const user = await User.findByIdAndUpdate(
    agentId,
    { $set: { isOnline, lastSeenAt: new Date() } },
    { new: true }
  ).select('name email role isOnline lastSeenAt avatar');
  if (user) {
    emitter.toAgents(isOnline ? 'agent:online' : 'agent:offline', {
      agentId: String(user._id),
      name: user.name,
      isOnline: user.isOnline,
      lastSeenAt: user.lastSeenAt,
    });
  }
  return user;
}

module.exports = {
  startSession,
  heartbeat,
  attachSocket,
  detachSocket,
  endSession,
  listOnline,
  getCustomerPresence,
  sweepStaleSessions,
  setAgentPresence,
  derivePresence,
  broadcastPresence,
  AWAY_AFTER_MS,
  OFFLINE_AFTER_MS,
};
