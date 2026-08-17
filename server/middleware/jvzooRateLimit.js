'use strict';

const rateLimit = require('express-rate-limit');
const env = require('../config/env');

/**
 * Rate limiter dedicated to the public JVZoo IPN endpoint.
 *
 * Generous enough for a legitimate product-launch spike (many genuine sales in
 * a short window) but bounded so a flood of forged IPNs cannot exhaust the
 * database with audit rows. Keyed per IP like the rest of the app. Disabled
 * under NODE_ENV=test so the integration tests are not throttled.
 */
const jvzooIpnLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.nodeEnv === 'test',
  // JVZoo ignores the body of a rate-limited response, but keep it valid JSON
  // for any human hitting the URL directly.
  message: { success: false, message: 'Too many webhook requests.' },
});

module.exports = { jvzooIpnLimiter };
