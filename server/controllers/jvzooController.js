'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const logger = require('../utils/logger');
const { hashIp } = require('../utils/tokens');
const jvzooService = require('../services/integrations/jvzooService');
const entitlements = require('../services/integrations/entitlementService');
const { PaymentEvent, Product, AuditLog, CustomerProduct } = require('../models');
const {
  PAYMENT_PROVIDERS,
  VERIFICATION_STATUS,
  CAPABILITIES,
} = require('../utils/constants');

/**
 * POST /api/integrations/jvzoo/ipn   (public, no auth — verified by signature)
 *
 * JVZoo posts application/x-www-form-urlencoded. The response body must be a
 * bare "1" on acceptance or JVZoo retries. Every branch below returns 200 with
 * that body when the event was *received* — even an unverified or unmapped one
 * — because a non-200 makes JVZoo hammer the endpoint. Whether access was
 * granted is recorded on the PaymentEvent, not signalled in the HTTP status.
 */
const receiveJvzooIpn = asyncHandler(async (req, res) => {
  if (!env.jvzoo.webhookEnabled) {
    // Explicitly disabled: acknowledge so JVZoo does not retry forever, but do
    // nothing. Nothing is stored, nothing is granted.
    logger.warn('JVZoo IPN received while JVZOO_WEBHOOK_ENABLED is off — ignoring.');
    return res.status(200).type('text/plain').send(jvzooService.ackBody());
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};

  const verification = jvzooService.verify(body);
  const normalized = jvzooService.normalize(body);
  const redactedPayload = jvzooService.redactPayload(body);
  const requestMeta = { ipHash: hashIp(req.ip), userAgent: (req.headers['user-agent'] || '').slice(0, 200) };

  // A forged/unverifiable event is still stored (fail-safe audit) but grants
  // nothing. `ingestEvent` enforces that internally.
  const { duplicate, paymentEvent, result } = await entitlements.ingestEvent({
    normalized,
    verification,
    redactedPayload,
    requestMeta,
    provider: PAYMENT_PROVIDERS.JVZOO,
  });

  if (verification.status === VERIFICATION_STATUS.UNCONFIGURED) {
    logger.error('JVZoo IPN could not be verified: JVZOO_IPN_SECRET is not set. Event stored, no access granted.');
  } else if (verification.status === VERIFICATION_STATUS.FAILED) {
    logger.warn(`JVZoo IPN failed verification (${verification.reason}). Stored for audit, no access granted.`);
  } else if (duplicate) {
    logger.info(`JVZoo IPN ${normalized.externalEventId} is a duplicate — acknowledged, no re-processing.`);
  } else if (result) {
    logger.info(`JVZoo IPN ${normalized.externalEventId}: ${result.outcome}${result.reason ? ` (${result.reason})` : ''}`);
  }

  // Always acknowledge a received event so JVZoo stops retrying.
  return res.status(200).type('text/plain').send(jvzooService.ackBody());
});

/* -------------------------------------------------------------------------
 * Admin surface (staff-authenticated, manage_integrations)
 * ---------------------------------------------------------------------- */

/** GET /api/integrations/jvzoo/events — recent payment events for the audit UI. */
const listEvents = asyncHandler(async (req, res) => {
  const filter = { provider: PAYMENT_PROVIDERS.JVZOO };
  if (req.query.pending === 'true') filter.pendingMapping = true;
  if (req.query.verification) filter.verificationStatus = req.query.verification;
  if (req.query.eventType) filter.eventType = req.query.eventType;

  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const events = await PaymentEvent.find(filter)
    .sort({ receivedAt: -1 })
    .limit(limit)
    .populate('customerId', 'name email')
    .populate('productId', 'name slug')
    .lean();

  const [total, pendingCount] = await Promise.all([
    PaymentEvent.countDocuments({ provider: PAYMENT_PROVIDERS.JVZOO }),
    PaymentEvent.countDocuments({ provider: PAYMENT_PROVIDERS.JVZOO, pendingMapping: true }),
  ]);

  res.json({ success: true, data: { events, total, pendingCount } });
});

/**
 * POST /api/integrations/jvzoo/events/:id/reprocess
 * Re-runs entitlement processing for a stored, verified event. Used after an
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

  res.json({ success: true, data: { outcome: result.outcome, reason: result.reason || '', event } });
});

/**
 * POST /api/integrations/jvzoo/events/reprocess-pending
 * Convenience: reprocess every pending-mapping event, e.g. right after adding
 * a new mapping. Bounded so it cannot run unbounded work in one request.
 */
const reprocessPending = asyncHandler(async (req, res) => {
  const events = await PaymentEvent.find({
    provider: PAYMENT_PROVIDERS.JVZOO,
    pendingMapping: true,
    verificationStatus: VERIFICATION_STATUS.VERIFIED,
  })
    .sort({ receivedAt: 1 })
    .limit(200);

  const summary = { granted: 0, revoked: 0, pending_mapping: 0, ignored: 0, error: 0 };
  for (const event of events) {
    // Sequential on purpose: entitlement writes touch shared customer records
    // and the work is bounded to 200, so parallelism buys little and risks
    // write contention on the same customer across a bundle.
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

/** GET /api/integrations/status — is the webhook configured? (no secrets) */
const integrationStatus = asyncHandler(async (_req, res) => {
  const [mappedProducts, activeEntitlements] = await Promise.all([
    Product.countDocuments({ jvzooProductIds: { $exists: true, $ne: [] } }),
    CustomerProduct.countDocuments({ verified: true, purchaseStatus: 'active' }),
  ]);

  res.json({
    success: true,
    data: {
      jvzoo: {
        webhookEnabled: env.jvzoo.webhookEnabled,
        secretConfigured: env.jvzoo.configured,
        ipnPath: '/api/integrations/jvzoo/ipn',
      },
      mappedProducts,
      activeEntitlements,
    },
  });
});

module.exports = {
  receiveJvzooIpn,
  listEvents,
  reprocessEvent,
  reprocessPending,
  integrationStatus,
  CAPABILITIES,
};
