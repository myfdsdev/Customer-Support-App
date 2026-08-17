'use strict';

const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const message = (msg) => ({ success: false, message: msg });

const base = {
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.nodeEnv === 'test',
};

/** Broad protection for the whole API surface. */
const apiLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: 300,
  message: message('Too many requests, please slow down.'),
});

/** Brute-force protection for credential endpoints. */
const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  message: message('Too many login attempts. Try again in a few minutes.'),
});

/** Gemini calls cost money and latency — throttle per IP. */
const aiLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: 20,
  message: message('You are sending messages too quickly. Please wait a moment.'),
});

/** Presence heartbeats are frequent by design but still bounded. */
const sessionLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: 120,
  message: message('Too many session updates.'),
});

const uploadLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: 30,
  message: message('Too many uploads, please wait.'),
});

/**
 * Payment webhook. Generous enough for a legitimate launch spike (many sales
 * in a short window) but bounded so a flood of forged IPNs cannot exhaust the
 * database. Keyed per IP like the rest.
 */
const webhookLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: 120,
  message: message('Too many webhook requests.'),
});

/** Brute-force protection for the portal login/registration endpoints. */
const portalAuthLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 30,
  skipSuccessfulRequests: true,
  message: message('Too many attempts. Please try again in a few minutes.'),
});

module.exports = {
  apiLimiter,
  authLimiter,
  aiLimiter,
  sessionLimiter,
  uploadLimiter,
  webhookLimiter,
  portalAuthLimiter,
};
