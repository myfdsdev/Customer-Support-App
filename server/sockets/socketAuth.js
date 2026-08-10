'use strict';

const { verifyToken, AUD_STAFF, AUD_SUPPORT } = require('../utils/tokens');
const { User, CustomerSession, Product } = require('../models');
const logger = require('../utils/logger');

/**
 * Socket handshake authentication.
 *
 * Nothing about identity is taken from the client payload. The token is
 * verified, then every id (agent, customer, session, product) is re-read from
 * the database and stashed on `socket.data`. Handlers use only those values.
 */
async function authenticateSocket(socket, next) {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token ||
      (socket.handshake.headers?.authorization || '').replace(/^Bearer\s+/i, '');

    if (!token) return next(new Error('Authentication required'));

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      return next(new Error('Invalid or expired token'));
    }

    if (payload.aud === AUD_STAFF) {
      const user = await User.findById(payload.sub).select('name email role status avatar');
      if (!user || user.status !== 'active') return next(new Error('Account is not active'));

      socket.data = {
        kind: 'agent',
        agentId: String(user._id),
        name: user.name,
        role: user.role,
        avatar: user.avatar,
      };
      return next();
    }

    if (payload.aud === AUD_SUPPORT) {
      const session = await CustomerSession.findById(payload.sub);
      if (!session) return next(new Error('Support session not found'));
      if (session.endedAt) return next(new Error('Support session has ended'));

      const product = await Product.findById(session.productId).select('name slug active');
      if (!product || !product.active) return next(new Error('Product is unavailable'));

      socket.data = {
        kind: 'customer',
        sessionId: String(session._id),
        customerId: session.customerId ? String(session.customerId) : null,
        productId: String(session.productId),
        productSlug: product.slug,
        anonymousId: session.anonymousId,
      };
      return next();
    }

    return next(new Error('Unknown token audience'));
  } catch (err) {
    logger.error('Socket auth error:', err.message);
    return next(new Error('Authentication failed'));
  }
}

module.exports = { authenticateSocket };
