'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

/**
 * Distinct token audiences keep the three identities from ever being
 * interchangeable. Every middleware asserts the audience it expects, so a
 * staff token can never authenticate a portal request and a portal token can
 * never reach an admin route — even though all three are signed with the same
 * secret.
 *
 *   staff    admin console (User)
 *   support  one browser session on one product's support surface
 *   customer membership portal login (Customer)
 *   launch   single-use-ish, short-lived proof of entitlement for an app launch
 */
const AUD_STAFF = 'staff';
const AUD_SUPPORT = 'support';
const AUD_CUSTOMER = 'customer';
const AUD_LAUNCH = 'launch';

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

/**
 * Membership-portal session token.
 *
 * Deliberately short-lived (2h by default) and carries nothing but the
 * customer id and a session version. `sv` is bumped on password change and on
 * logout-everywhere, which invalidates tokens already in the wild without a
 * server-side session store.
 */
function signCustomerToken(customer) {
  return jwt.sign(
    { sub: String(customer._id), aud: AUD_CUSTOMER, sv: customer.sessionVersion || 0 },
    env.jwtSecret,
    { expiresIn: env.portal.tokenExpiresIn }
  );
}

/**
 * Proof that the server verified this customer's entitlement to this product,
 * good for a few minutes. Handed to a destination app that opts into checking
 * it; harmless if the app ignores it, because it grants nothing on its own.
 */
function signLaunchToken({ customerId, productId, email }) {
  return jwt.sign(
    { sub: String(customerId), aud: AUD_LAUNCH, productId: String(productId), email: email || '' },
    env.jwtSecret,
    { expiresIn: `${env.portal.launchTokenMinutes}m` }
  );
}

function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

const newAnonymousId = () => `anon_${crypto.randomBytes(12).toString('hex')}`;

/** Random opaque secret handed to the user; only its hash is ever stored. */
const newOpaqueToken = () => crypto.randomBytes(32).toString('hex');

/**
 * SHA-256 rather than bcrypt on purpose: these tokens are already 256 bits of
 * entropy, so there is nothing to brute-force, and the lookup has to be an
 * indexed equality match rather than a per-row compare.
 */
const hashOpaqueToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

/** Timing-safe string comparison for secrets of unequal length. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ''), 'utf8');
  const bufB = Buffer.from(String(b ?? ''), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const hashIp = (ip = '') =>
  crypto.createHash('sha256').update(String(ip) + env.jwtSecret).digest('hex').slice(0, 32);

module.exports = {
  AUD_STAFF,
  AUD_SUPPORT,
  AUD_CUSTOMER,
  AUD_LAUNCH,
  signStaffToken,
  signSupportToken,
  signCustomerToken,
  signLaunchToken,
  verifyToken,
  newAnonymousId,
  newOpaqueToken,
  hashOpaqueToken,
  safeEqual,
  hashIp,
};
