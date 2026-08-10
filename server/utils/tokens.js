'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

/**
 * Two distinct token audiences keep staff sessions and anonymous customer
 * sessions from ever being interchangeable.
 */
const AUD_STAFF = 'staff';
const AUD_SUPPORT = 'support';

function signStaffToken(user) {
  return jwt.sign(
    { sub: String(user._id), role: user.role, aud: AUD_STAFF },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

/**
 * Issued to an unauthenticated website visitor on a product support page.
 * Carries the server-resolved product/session/customer ids so nothing sensitive
 * ever has to be trusted from the client afterwards.
 */
function signSupportToken({ sessionId, productId, customerId, anonymousId }) {
  return jwt.sign(
    {
      sub: String(sessionId),
      aud: AUD_SUPPORT,
      productId: String(productId),
      customerId: customerId ? String(customerId) : null,
      anonymousId,
    },
    env.jwtSecret,
    { expiresIn: env.supportTokenExpiresIn }
  );
}

function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

const newAnonymousId = () => `anon_${crypto.randomBytes(12).toString('hex')}`;

const hashIp = (ip = '') =>
  crypto.createHash('sha256').update(String(ip) + env.jwtSecret).digest('hex').slice(0, 32);

module.exports = {
  AUD_STAFF,
  AUD_SUPPORT,
  signStaffToken,
  signSupportToken,
  verifyToken,
  newAnonymousId,
  hashIp,
};
