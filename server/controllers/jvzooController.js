'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const logger = require('../utils/logger');
const { hashIp } = require('../utils/tokens');
const jvzooService = require('../services/integrations/jvzooService');
const verifier = require('../services/integrations/jvzooVerifier');
const entitlements = require('../services/integrations/entitlementService');
const { PaymentEvent, Product, AuditLog, CustomerProduct } = require('../models');
const {
  PAYMENT_PROVIDERS,
  VERIFICATION_STATUS,
  PROCESSING_STATUS,
  OFFER_TYPE_LIST,
} = require('../utils/constants');

/* -------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------- */

/** Partially masks an email for admin display: jo***@ex****.com */
function maskEmail(email) {
  const value = String(email || '');
  const at = value.indexOf('@');
  if (at < 1) return value ? '***' : '';
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const maskedLocal = local.slice(0, 2) + '***';
  const dot = domain.lastIndexOf('.');
  const maskedDomain =
    dot > 0 ? domain.slice(0, 2) + '****' + domain.slice(dot) : domain.slice(0, 2) + '****';
  return `${maskedLocal}@${maskedDomain}`;
}

/**
 * The central IPN URL, pointing at the BACKEND API domain — derived from the
 * actual incoming request host (correct for both single-service and split
 * deployments), falling back to APP_BASE_URL. Never the Vite frontend origin.
 */
function ipnUrl(req) {
  const fromEnv = env.appBaseUrl;
  const fromReq = req ? `${req.protocol}://${req.get('host')}` : '';
  const base = (fromReq || fromEnv || '').replace(/\/+$/, '');
  return `${base}/api/integrations/jvzoo/ipn`;
}

/* -------------------------------------------------------------------------
 * POST /api/integrations/jvzoo/ipn   (public, verified by signature)
 *
 * JVZoo posts application/x-www-form-urlencoded and expects a bare "1" on
 * receipt, or it retries. Every branch returns 200 + "1" when the event was
 * RECEIVED (even unverified/unmapped) so JVZoo stops retrying; whether access
 * was granted is recorded on the PaymentEvent, never signalled via HTTP status.
 * The event is persisted before entitlement work, so acknowledgement stays
 * fast and nothing is lost.
 * ---------------------------------------------------------------------- */
const receiveJvzooIpn = asyncHandler(async (req, res) => {
  if (!env.jvzoo.webhookEnabled) {
    logger.warn('JVZoo IPN received while JVZOO_WEBHOOK_ENABLED is off — ignoring.');
    return res.status(200).type('text/plain').send(jvzooService.ackBody());
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};

  const verification = jvzooService.verify(body);
  const normalized = jvzooService.normalize(body, { verified: verification.ok });
  const redactedPayload = jvzooService.redactPayload(body);
  const payloadHash = jvzooService.payloadHash(body);
  const requestMeta = { ipHash: hashIp(req.ip), userAgent: (req.headers['user-agent'] || '').slice(0, 200) };

  const { duplicate, paymentEvent, result } = await entitlements.ingestEvent({
    normalized,
    verification,
    redactedPayload,
    payloadHash,
    requestMeta,
  });

  if (verification.status === VERIFICATION_STATUS.BLOCKED) {
    logger.error(
      'JVZoo IPN NOT processed: verification is BLOCKED (scheme unconfirmed). ' +
        'Set JVZOO_VERIFICATION_CONFIRMED=true only after validating a real test IPN. Event stored for audit.'
    );
  } else if (verification.status === VERIFICATION_STATUS.UNCONFIGURED) {
    logger.error('JVZoo IPN could not be verified: JVZOO_IPN_SECRET is not set. Event stored, no access granted.');
  } else if (verification.status === VERIFICATION_STATUS.FAILED) {
    logger.warn(`JVZoo IPN failed verification (${verification.reason}). Stored for audit, no access granted.`);
  } else if (duplicate) {
    logger.info(`JVZoo IPN ${normalized.eventId} is a duplicate — acknowledged, no re-processing.`);
  } else if (result) {
    logger.info(`JVZoo IPN ${normalized.eventId}: ${result.outcome}${result.reason ? ` (${result.reason})` : ''}`);
  }

  return res.status(200).type('text/plain').send(jvzooService.ackBody());
});

/* -------------------------------------------------------------------------
 * Admin surface (staff-authenticated, manage_integrations)
 * ---------------------------------------------------------------------- */

/** GET /api/integrations/jvzoo/events — filterable, email-masked event list. */
const listEvents = asyncHandler(async (req, res) => {
  const filter = { provider: PAYMENT_PROVIDERS.JVZOO };
  if (req.query.processingStatus) filter.processingStatus = req.query.processingStatus;
  if (req.query.verificationStatus) filter.verificationStatus = req.query.verificationStatus;
  if (req.query.eventType) filter.eventType = req.query.eventType;
  if (req.query.externalProductId) filter.externalProductId = req.query.externalProductId;
  if (req.query.pending === 'true') filter.processingStatus = PROCESSING_STATUS.PENDING_MAPPING;
  if (req.query.from || req.query.to) {
    filter.receivedAt = {};
    if (req.query.from) filter.receivedAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.receivedAt.$lte = new Date(req.query.to);
  }

  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const rows = await PaymentEvent.find(filter)
    .sort({ receivedAt: -1 })
    .limit(limit)
    .populate('customerId', 'name')
    .populate('productId', 'name slug')
    .lean();

  const [total, pendingCount, failedCount] = await Promise.all([
    PaymentEvent.countDocuments({ provider: PAYMENT_PROVIDERS.JVZOO }),
    PaymentEvent.countDocuments({ provider: PAYMENT_PROVIDERS.JVZOO, processingStatus: PROCESSING_STATUS.PENDING_MAPPING }),
    PaymentEvent.countDocuments({ provider: PAYMENT_PROVIDERS.JVZOO, processingStatus: PROCESSING_STATUS.FAILED }),
  ]);

  // Never send the full email to the client list — mask it.
  const events = rows.map((e) => ({
    _id: e._id,
    eventType: e.eventType,
    rawEventType: e.rawEventType,
    transactionId: e.transactionId,
    parentTransactionId: e.parentTransactionId,
    externalProductId: e.externalProductId,
    customerEmailMasked: maskEmail(e.customerEmail),
    verificationStatus: e.verificationStatus,
    processingStatus: e.processingStatus,
    processed: e.processed,
    failureReason: e.failureReason,
    amount: e.amount,
    currency: e.currency,
    product: e.productId ? { _id: e.productId._id, name: e.productId.name, slug: e.productId.slug } : null,
    customerName: e.customerId ? e.customerId.name : e.customerName,
    receivedAt: e.receivedAt,
    retryCount: e.retryCount,
  }));

  res.json({ success: true, data: { events, total, pendingCount, failedCount } });
});

/** GET /api/integrations/jvzoo/events/:id — one event, sanitized payload view. */
const getEvent = asyncHandler(async (req, res) => {
  const e = await PaymentEvent.findById(req.params.id)
    .populate('customerId', 'name email')
    .populate('productId', 'name slug')
    .lean();
  if (!e) throw ApiError.notFound('Payment event not found');

  // The sanitized payload is already secret-free; still mask the email inside it.
  const payload = { ...(e.redactedPayload || {}) };
  if (payload.ccustemail) payload.ccustemail = maskEmail(payload.ccustemail);

  res.json({
    success: true,
    data: {
      _id: e._id,
      eventType: e.eventType,
      rawEventType: e.rawEventType,
      transactionId: e.transactionId,
      parentTransactionId: e.parentTransactionId,
      externalProductId: e.externalProductId,
      customerEmailMasked: maskEmail(e.customerEmail),
      verificationStatus: e.verificationStatus,
      processingStatus: e.processingStatus,
      failureReason: e.failureReason,
      amount: e.amount,
      currency: e.currency,
      payloadHash: e.payloadHash,
      redactedPayload: payload,
      product: e.productId || null,
      receivedAt: e.receivedAt,
      retryCount: e.retryCount,
    },
  });
});

/**
 * POST /api/integrations/jvzoo/events/:id/reprocess
 * Re-runs entitlement processing for a stored, verified event — used after an
 * admin maps a previously-unmapped product id.
 */
const reprocessEvent = asyncHandler(async (req, res) => {
  const event = await PaymentEvent.findById(req.params.id);
  if (!event) throw ApiError.notFound('Payment event not found');
  if (event.verificationStatus !== VERIFICATION_STATUS.VERIFIED) {
    throw ApiError.badRequest('Only verified events can be reprocessed');
  }

  const result = await entitlements.processPaymentEvent(event);

  await AuditLog.record({
    actorId: req.user._id,
    actorName: req.user.name,
    actorRole: req.user.role,
    action: 'jvzoo.event.reprocess',
    targetType: 'payment_event',
    targetId: event._id,
    summary: `Reprocessed JVZoo event ${event.externalEventId} → ${result.outcome}`,
    meta: { outcome: result.outcome, reason: result.reason || '' },
    ipHash: hashIp(req.ip),
  });

  res.json({ success: true, data: { outcome: result.outcome, reason: result.reason || '' } });
});

/** POST /api/integrations/jvzoo/events/reprocess-pending — bounded batch. */
const reprocessPending = asyncHandler(async (req, res) => {
  const events = await PaymentEvent.find({
    provider: PAYMENT_PROVIDERS.JVZOO,
    processingStatus: PROCESSING_STATUS.PENDING_MAPPING,
    verificationStatus: VERIFICATION_STATUS.VERIFIED,
  })
    .sort({ receivedAt: 1 })
    .limit(200);

  const summary = { granted: 0, revoked: 0, pending_mapping: 0, ignored: 0, failed: 0 };
  for (const event of events) {
    // eslint-disable-next-line no-await-in-loop
    const result = await entitlements.processPaymentEvent(event);
    summary[result.outcome] = (summary[result.outcome] || 0) + 1;
  }

  await AuditLog.record({
    actorId: req.user._id,
    actorName: req.user.name,
    actorRole: req.user.role,
    action: 'jvzoo.event.reprocess_pending',
    summary: `Reprocessed ${events.length} pending JVZoo events`,
    meta: summary,
    ipHash: hashIp(req.ip),
  });

  res.json({ success: true, data: { processed: events.length, summary } });
});

/**
 * POST /api/integrations/jvzoo/events/:id/assign-mapping
 * Body: { productId, offerType?, accessPlan? }
 *
 * Maps the event's unmapped external product id to an internal product (adds a
 * mapping to that product), then reprocesses this event. Rejects if the id is
 * already actively mapped elsewhere.
 */
const assignMapping = asyncHandler(async (req, res) => {
  const event = await PaymentEvent.findById(req.params.id);
  if (!event) throw ApiError.notFound('Payment event not found');
  const externalId = event.externalProductId;
  if (!externalId) throw ApiError.badRequest('This event has no external product id to map');

  const product = await Product.findById(req.body.productId);
  if (!product) throw ApiError.notFound('Target product not found');

  const offerType = OFFER_TYPE_LIST.includes(req.body.offerType) ? req.body.offerType : 'fe';
  const accessPlan = String(req.body.accessPlan || '').trim();

  // Cross-product uniqueness: the id must not be active on any OTHER product.
  const clash = await Product.findOne({
    _id: { $ne: product._id },
    jvzooMappings: { $elemMatch: { externalProductId: externalId, active: true } },
  }).select('name');
  if (clash) {
    throw ApiError.conflict(`JVZoo id ${externalId} is already mapped to "${clash.name}". Remove it there first.`);
  }

  const existing = (product.jvzooMappings || []).find((m) => m.externalProductId === externalId);
  if (existing) {
    existing.active = true;
    existing.offerType = offerType;
    if (accessPlan) existing.accessPlan = accessPlan;
  } else {
    product.jvzooMappings.push({ externalProductId: externalId, offerType, accessPlan, active: true });
  }
  await product.save();

  const result = await entitlements.processPaymentEvent(event);

  await AuditLog.record({
    actorId: req.user._id,
    actorName: req.user.name,
    actorRole: req.user.role,
    action: 'jvzoo.mapping.assign',
    targetType: 'product',
    targetId: product._id,
    summary: `Mapped JVZoo id ${externalId} → ${product.name} (${offerType}); event ${result.outcome}`,
    meta: { externalId, offerType, accessPlan, outcome: result.outcome },
    ipHash: hashIp(req.ip),
  });

  res.json({ success: true, data: { outcome: result.outcome, product: { _id: product._id, name: product.name } } });
});

/** GET /api/integrations/status — no secrets, ever. */
const integrationStatus = asyncHandler(async (req, res) => {
  const [mappedProducts, activeEntitlements] = await Promise.all([
    Product.countDocuments({
      $or: [{ 'jvzooMappings.0': { $exists: true } }, { jvzooProductIds: { $exists: true, $ne: [] } }],
    }),
    CustomerProduct.countDocuments({ verified: true, purchaseStatus: 'active' }),
  ]);

  res.json({
    success: true,
    data: {
      jvzoo: {
        webhookEnabled: env.jvzoo.webhookEnabled,
        secretConfigured: verifier.isConfigured(),
        verificationConfirmed: verifier.isConfirmed(),
        // Production is only truly live when all three are true.
        productionReady: env.jvzoo.webhookEnabled && verifier.isConfigured() && verifier.isConfirmed(),
        ipnUrl: ipnUrl(req),
      },
      mappedProducts,
      activeEntitlements,
    },
  });
});

module.exports = {
  receiveJvzooIpn,
  listEvents,
  getEvent,
  reprocessEvent,
  reprocessPending,
  assignMapping,
  integrationStatus,
  maskEmail,
};
