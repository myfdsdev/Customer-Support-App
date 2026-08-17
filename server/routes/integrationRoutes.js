'use strict';

const express = require('express');
const jvzoo = require('../controllers/jvzooController');
const csvImport = require('../controllers/csvImportController');
const { authenticateUser, requireCapability } = require('../middleware/auth');
const { jvzooIpnLimiter } = require('../middleware/jvzooRateLimit');
const { upload } = require('../middleware/upload');
const { CAPABILITIES } = require('../utils/constants');

/**
 * Payment-provider integrations. Mounted at /api/integrations.
 *
 * The public IPN endpoint is mounted BEFORE the global input sanitiser (in
 * routes/index.js): JVZoo's signature is computed over the raw posted field
 * values, so nothing may rewrite them in flight. It is protected instead by
 * signature verification and its own dedicated rate limiter, and parses its own
 * urlencoded body with a strict size cap.
 *
 * Every admin route requires the `manage_integrations` capability (super_admin
 * only by default) — support agents and marketing managers cannot map product
 * ids, import CSVs, reprocess events or view payment events.
 */
const router = express.Router();

// --- Public webhook (verified by signature, not by session) ---------------
router.post(
  '/jvzoo/ipn',
  jvzooIpnLimiter,
  express.urlencoded({ extended: false, limit: '256kb' }),
  jvzoo.receiveJvzooIpn
);

// --- Admin surface --------------------------------------------------------
const requireIntegrations = requireCapability(CAPABILITIES.MANAGE_INTEGRATIONS);

router.use(authenticateUser);
router.get('/status', requireIntegrations, jvzoo.integrationStatus);
router.get('/jvzoo/events', requireIntegrations, jvzoo.listEvents);
router.get('/jvzoo/events/:id', requireIntegrations, jvzoo.getEvent);
router.post('/jvzoo/events/reprocess-pending', requireIntegrations, jvzoo.reprocessPending);
router.post('/jvzoo/events/:id/reprocess', requireIntegrations, jvzoo.reprocessEvent);
router.post('/jvzoo/events/:id/assign-mapping', requireIntegrations, jvzoo.assignMapping);
router.post('/jvzoo/import', requireIntegrations, upload.single('file'), csvImport.importCsv);

module.exports = router;
