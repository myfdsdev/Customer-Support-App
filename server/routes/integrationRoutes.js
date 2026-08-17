'use strict';

const express = require('express');
const jvzoo = require('../controllers/jvzooController');
const csvImport = require('../controllers/csvImportController');
const { authenticateUser, requireCapability } = require('../middleware/auth');
const { webhookLimiter } = require('../middleware/rateLimit');
const { upload } = require('../middleware/upload');
const { CAPABILITIES } = require('../utils/constants');

/**
 * Payment-provider integrations. Mounted at /api/integrations.
 *
 * The public IPN endpoint is deliberately mounted BEFORE the global input
 * sanitiser in routes/index.js: the JVZoo signature is computed over the raw
 * posted field values, so nothing may rewrite them in flight. It is protected
 * instead by signature verification and its own rate limiter.
 *
 * Every admin route below requires the `manage_integrations` capability, which
 * only super_admin holds — a support agent or marketing manager cannot map
 * product ids, import CSVs or reprocess events.
 */
const router = express.Router();

// --- Public webhook (verified by signature, not by session) ---------------
router.post(
  '/jvzoo/ipn',
  webhookLimiter,
  // JVZoo posts urlencoded; parse it locally so this route does not depend on
  // global body parsers being ordered a particular way.
  express.urlencoded({ extended: false, limit: '256kb' }),
  jvzoo.receiveJvzooIpn
);

// --- Admin surface --------------------------------------------------------
const requireIntegrations = requireCapability(CAPABILITIES.MANAGE_INTEGRATIONS);

router.use(authenticateUser);
router.get('/status', requireIntegrations, jvzoo.integrationStatus);
router.get('/jvzoo/events', requireIntegrations, jvzoo.listEvents);
router.post('/jvzoo/events/reprocess-pending', requireIntegrations, jvzoo.reprocessPending);
router.post('/jvzoo/events/:id/reprocess', requireIntegrations, jvzoo.reprocessEvent);
router.post('/jvzoo/import', requireIntegrations, upload.single('file'), csvImport.importCsv);

module.exports = router;
