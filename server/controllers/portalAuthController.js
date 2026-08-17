'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const logger = require('../utils/logger');
const {
  signCustomerToken,
  newOpaqueToken,
  hashOpaqueToken,
} = require('../utils/tokens');
const { setCustomerCookie, clearCustomerCookie } = require('../middleware/customerAuth');
const { Customer, CustomerProduct } = require('../models');
const { PURCHASE_STATUS } = require('../utils/constants');

/**
 * Membership-portal authentication.
 *
 * Separate from staff auth in every way that matters: its own model (Customer),
 * its own token audience, its own cookie, its own rate limiter. A person who
 * bought through JVZoo registers here on their purchase email and instantly
 * "claims" the CRM record (and any imported purchases) that already carries
 * that email — no duplicate is ever created.
 */

const LOCK_THRESHOLD = 8;
const LOCK_MINUTES = 15;

function tokenMaxAgeMs() {
  // Mirrors CUSTOMER_TOKEN_EXPIRES_IN so the cookie and the JWT expire together.
  const raw = String(env.portal.tokenExpiresIn);
  const match = raw.match(/^(\d+)\s*([smhd])?$/i);
  if (!match) return 2 * 60 * 60 * 1000;
  const n = Number(match[1]);
  const unit = (match[2] || 's').toLowerCase();
  const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit];
  return n * mult;
}

/** Issues the session token, sets the cookie, and returns the token too (for
 *  bearer-based clients on cross-origin deployments). */
function establishSession(res, customer) {
  const token = signCustomerToken(customer);
  setCustomerCookie(res, token, tokenMaxAgeMs());
  return token;
}

/* -------------------------------------------------------------------------
 * POST /api/portal/auth/register
 * ---------------------------------------------------------------------- */
const register = asyncHandler(async (req, res) => {
  const email = Customer.normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  const name = String(req.body.name || '').trim();

  if (!email) throw ApiError.badRequest('A valid email is required');
  if (password.length < 8) throw ApiError.badRequest('Password must be at least 8 characters');

  // Claim an existing record (CRM visitor or imported purchaser) if one holds
  // this email; otherwise create a fresh customer.
  let customer = await Customer.findOne({ email }).select('+passwordHash');

  if (customer && customer.hasPortalAccount) {
    // Never reveal whether an email is registered via a hard error path that
    // differs from the success path timing-wise; a clear message is fine here
    // because registration is not a login oracle — but still guide them well.
    throw ApiError.conflict('An account already exists for this email. Try signing in or resetting your password.');
  }

  if (!customer) {
    customer = new Customer({ email, name, status: 'active', verifiedSource: 'portal_registration' });
  } else if (name && !customer.name) {
    customer.name = name;
  }

  await customer.setPassword(password);

  // Email verification is opt-in (no mail transport wired up by default).
  if (env.portal.requireEmailVerification) {
    const raw = newOpaqueToken();
    customer.emailVerificationTokenHash = hashOpaqueToken(raw);
    customer.emailVerificationExpiresAt = new Date(Date.now() + env.portal.resetTokenMinutes * 60000);
    customer.emailVerified = false;
    // The link would be emailed here. With no transport, log it in dev so the
    // flow is testable, and surface a flag to the client.
    if (!env.isProd) {
      logger.info(`[portal] Email verification link: ${verifyUrl(raw)}`);
    }
  } else {
    customer.emailVerified = true;
    customer.emailVerifiedAt = new Date();
  }

  customer.lastLoginAt = new Date();
  await customer.save();

  // If verification is required, do not establish a session yet.
  if (env.portal.requireEmailVerification) {
    return res.status(201).json({
      success: true,
      data: { requiresVerification: true, email: customer.email },
    });
  }

  establishSession(res, customer);
  return res.status(201).json({
    success: true,
    data: { customer: customer.toPortalJSON(), token: signCustomerToken(customer) },
  });
});

/* -------------------------------------------------------------------------
 * POST /api/portal/auth/login
 * ---------------------------------------------------------------------- */
const login = asyncHandler(async (req, res) => {
  const email = Customer.normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  if (!email || !password) throw ApiError.badRequest('Email and password are required');

  const customer = await Customer.findOne({ email }).select('+passwordHash +failedLoginCount +lockedUntil');

  // Uniform failure: never disclose whether the email exists.
  const invalid = () => {
    throw ApiError.unauthorized('Invalid email or password');
  };

  if (!customer || !customer.hasPortalAccount) return invalid();

  if (customer.lockedUntil && customer.lockedUntil > new Date()) {
    throw new ApiError(429, 'Too many failed attempts. Please try again shortly.');
  }
  if (customer.status === 'blocked') throw ApiError.forbidden('This account has been suspended');

  const ok = await customer.verifyPassword(password);
  if (!ok) {
    customer.failedLoginCount = (customer.failedLoginCount || 0) + 1;
    if (customer.failedLoginCount >= LOCK_THRESHOLD) {
      customer.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60000);
      customer.failedLoginCount = 0;
    }
    await customer.save();
    return invalid();
  }

  if (env.portal.requireEmailVerification && !customer.emailVerified) {
    throw ApiError.forbidden('Please verify your email address before signing in.');
  }

  customer.failedLoginCount = 0;
  customer.lockedUntil = null;
  customer.lastLoginAt = new Date();
  await customer.save();

  establishSession(res, customer);
  return res.json({
    success: true,
    data: { customer: customer.toPortalJSON(), token: signCustomerToken(customer) },
  });
});

/* -------------------------------------------------------------------------
 * POST /api/portal/auth/logout
 * ---------------------------------------------------------------------- */
const logout = asyncHandler(async (req, res) => {
  clearCustomerCookie(res);
  res.json({ success: true, message: 'Signed out' });
});

/* -------------------------------------------------------------------------
 * GET /api/portal/auth/me
 * ---------------------------------------------------------------------- */
const me = asyncHandler(async (req, res) => {
  const activeCount = await CustomerProduct.countDocuments({
    customerId: req.customer._id,
    verified: true,
    purchaseStatus: PURCHASE_STATUS.ACTIVE,
  });
  res.json({
    success: true,
    data: { customer: req.customer.toPortalJSON(), productCount: activeCount },
  });
});

/* -------------------------------------------------------------------------
 * POST /api/portal/auth/forgot-password
 * Always returns success — never reveals whether the email is registered.
 * ---------------------------------------------------------------------- */
const forgotPassword = asyncHandler(async (req, res) => {
  const email = Customer.normalizeEmail(req.body.email);
  const generic = { success: true, message: 'If that email has an account, a reset link is on its way.' };

  if (!email) return res.json(generic);

  const customer = await Customer.findOne({ email });
  if (customer && customer.hasPortalAccount) {
    const raw = newOpaqueToken();
    customer.passwordResetTokenHash = hashOpaqueToken(raw);
    customer.passwordResetExpiresAt = new Date(Date.now() + env.portal.resetTokenMinutes * 60000);
    await customer.save();

    // With a mail transport, the link is emailed here. Until then, log it in
    // development so the flow can be exercised end to end.
    if (!env.isProd) logger.info(`[portal] Password reset link: ${resetUrl(raw)}`);
  }

  return res.json(generic);
});

/* -------------------------------------------------------------------------
 * POST /api/portal/auth/reset-password
 * ---------------------------------------------------------------------- */
const resetPassword = asyncHandler(async (req, res) => {
  const token = String(req.body.token || '');
  const password = String(req.body.password || '');
  if (!token) throw ApiError.badRequest('Reset token is required');
  if (password.length < 8) throw ApiError.badRequest('Password must be at least 8 characters');

  const customer = await Customer.findOne({
    passwordResetTokenHash: hashOpaqueToken(token),
    passwordResetExpiresAt: { $gt: new Date() },
  }).select('+passwordHash');

  if (!customer) throw ApiError.badRequest('This reset link is invalid or has expired');

  await customer.setPassword(password); // also bumps sessionVersion, killing old tokens
  customer.passwordResetTokenHash = null;
  customer.passwordResetExpiresAt = null;
  // A successful reset proves control of the inbox.
  customer.emailVerified = true;
  customer.emailVerifiedAt = customer.emailVerifiedAt || new Date();
  await customer.save();

  establishSession(res, customer);
  res.json({
    success: true,
    data: { customer: customer.toPortalJSON(), token: signCustomerToken(customer) },
  });
});

/* -------------------------------------------------------------------------
 * POST /api/portal/auth/verify-email   (only relevant when required)
 * ---------------------------------------------------------------------- */
const verifyEmail = asyncHandler(async (req, res) => {
  const token = String(req.body.token || '');
  if (!token) throw ApiError.badRequest('Verification token is required');

  const customer = await Customer.findOne({
    emailVerificationTokenHash: hashOpaqueToken(token),
    emailVerificationExpiresAt: { $gt: new Date() },
  });
  if (!customer) throw ApiError.badRequest('This verification link is invalid or has expired');

  customer.emailVerified = true;
  customer.emailVerifiedAt = new Date();
  customer.emailVerificationTokenHash = null;
  customer.emailVerificationExpiresAt = null;
  await customer.save();

  establishSession(res, customer);
  res.json({ success: true, data: { customer: customer.toPortalJSON(), token: signCustomerToken(customer) } });
});

// --- helpers ---------------------------------------------------------------
function portalBase() {
  return env.appBaseUrl || env.clientUrl.split(',')[0].trim() || '';
}
function resetUrl(rawToken) {
  return `${portalBase()}/reset-password/${rawToken}`;
}
function verifyUrl(rawToken) {
  return `${portalBase()}/verify-email/${rawToken}`;
}

module.exports = {
  register,
  login,
  logout,
  me,
  forgotPassword,
  resetPassword,
  verifyEmail,
};
