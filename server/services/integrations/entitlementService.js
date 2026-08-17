'use strict';

const {
  Customer,
  Product,
  CustomerProduct,
  PaymentEvent,
  Notification,
} = require('../../models');
const {
  PAYMENT_PROVIDERS,
  PAYMENT_EVENT_TYPES,
  GRANTING_EVENT_TYPES,
  REVOKING_EVENT_TYPES,
  PURCHASE_STATUS,
  PROCESSING_STATUS,
  VERIFICATION_STATUS,
  NOTIFICATION_TYPES,
} = require('../../utils/constants');
const logger = require('../../utils/logger');
const emitter = require('../socket/emitter');

/**
 * Provider-agnostic entitlement lifecycle.
 *
 * Everything downstream of the webhook operates on the NORMALIZED event shape
 * (see jvzooService.normalize), never raw request fields. A verified
 * grant creates/updates a CustomerProduct; a verified refund/chargeback/cancel
 * flips its status without deleting history. Idempotency is enforced at the
 * data layer by the PaymentEvent unique index — the same event delivered any
 * number of times applies access at most once.
 *
 * The AI and the browser are never writers here.
 */

/** Maps an access state onto the legacy `subscriptionStatus` enum. */
const SUBSCRIPTION_FOR_STATUS = {
  [PURCHASE_STATUS.ACTIVE]: 'active',
  [PURCHASE_STATUS.REFUNDED]: 'refunded',
  [PURCHASE_STATUS.CHARGEBACK]: 'cancelled',
  [PURCHASE_STATUS.CANCELLED]: 'cancelled',
  [PURCHASE_STATUS.EXPIRED]: 'expired',
  [PURCHASE_STATUS.PENDING]: 'none',
  [PURCHASE_STATUS.FAILED]: 'none',
};

/**
 * Resolves the internal product an external JVZoo id maps to.
 *
 * Prefers the structured `jvzooMappings` (active only), returning the offer
 * type and access plan; falls back to the deprecated flat `jvzooProductIds`
 * for any product not yet migrated. Product name is NEVER used for matching.
 *
 * @returns {null | { product, offerType, accessPlan }}
 */
async function resolveMapping(externalProductId) {
  const id = String(externalProductId || '').trim();
  if (!id) return null;

  // Structured mapping first.
  const mapped = await Product.findOne({
    jvzooMappings: { $elemMatch: { externalProductId: id, active: true } },
  });
  if (mapped) {
    const m = (mapped.jvzooMappings || []).find((x) => x.active && x.externalProductId === id);
    return { product: mapped, offerType: m?.offerType || '', accessPlan: m?.accessPlan || '' };
  }

  // Legacy flat list fallback.
  const legacy = await Product.findOne({ jvzooProductIds: id });
  if (legacy) return { product: legacy, offerType: '', accessPlan: '' };

  return null;
}

/**
 * Finds or creates the Customer for a purchase email, never duplicating an
 * email that already exists (case-insensitively). Does NOT set a password —
 * the webhook only creates verified customer + entitlement data; login/claiming
 * is a separate flow.
 */
async function findOrCreateCustomerByEmail({ email, name }) {
  const normalized = Customer.normalizeEmail(email);
  if (!normalized) return null;

  let customer = await Customer.findOne({ email: normalized });
  if (customer) {
    if (name && !customer.name) {
      customer.name = name;
      await customer.save().catch(() => null);
    }
    return customer;
  }

  try {
    customer = await Customer.create({
      email: normalized,
      name: name || '',
      status: 'active',
      verifiedSource: 'jvzoo',
    });
  } catch (err) {
    if (err.code === 11000) return Customer.findOne({ email: normalized }); // lost a create race
    throw err;
  }
  return customer;
}

/**
 * Applies one already-VERIFIED normalized event to the entitlement table.
 *
 * @returns {{ outcome, entitlement?, customer?, product?, reason? }}
 *   outcome ∈ 'granted' | 'revoked' | 'pending_mapping' | 'ignored'
 */
async function applyEvent({ event }) {
  const isGrant = GRANTING_EVENT_TYPES.includes(event.eventType);
  const isRevoke = REVOKING_EVENT_TYPES.includes(event.eventType);

  if (!isGrant && !isRevoke) {
    return { outcome: 'ignored', reason: `event type "${event.eventType}" does not change access` };
  }

  const mapping = await resolveMapping(event.externalProductId);

  // A revocation can still find its target by transaction id even if the
  // mapping was removed after the sale — resolve entitlement by the verified
  // transaction reference, never by email alone.
  if (!mapping && isRevoke) {
    const existing = await CustomerProduct.findOne({
      provider: PAYMENT_PROVIDERS.JVZOO,
      transactionId: event.transactionId,
    });
    if (existing) {
      await revokeEntitlement(existing, event);
      const customer = await Customer.findById(existing.customerId);
      await notifyAccessChange(customer, existing.productId, NOTIFICATION_TYPES.ACCESS_REVOKED);
      emitAccessUpdated(existing.customerId, existing.productId, existing.purchaseStatus);
      return { outcome: 'revoked', entitlement: existing, customer, product: null };
    }
  }

  if (!mapping) {
    return { outcome: 'pending_mapping', reason: `no active mapping for JVZoo id "${event.externalProductId}"` };
  }

  const customer = await findOrCreateCustomerByEmail({ email: event.customerEmail, name: event.customerName });
  if (!customer) return { outcome: 'ignored', reason: 'event carried no usable customer email' };

  if (isRevoke) {
    const entitlement = await CustomerProduct.findOne({ customerId: customer._id, productId: mapping.product._id });
    if (!entitlement) return { outcome: 'ignored', reason: 'nothing to revoke for this customer/product' };
    await revokeEntitlement(entitlement, event);
    await notifyAccessChange(customer, mapping.product, NOTIFICATION_TYPES.ACCESS_REVOKED);
    emitAccessUpdated(customer._id, mapping.product._id, entitlement.purchaseStatus);
    return { outcome: 'revoked', entitlement, customer, product: mapping.product };
  }

  const entitlement = await grantEntitlement({ customer, mapping, event });
  await notifyAccessChange(customer, mapping.product, NOTIFICATION_TYPES.ACCESS_GRANTED);
  emitAccessUpdated(customer._id, mapping.product._id, PURCHASE_STATUS.ACTIVE);
  return { outcome: 'granted', entitlement, customer, product: mapping.product };
}

/**
 * Upserts an ACTIVE, verified entitlement. Idempotent: replaying the same sale
 * re-stamps `lastVerifiedAt` but never creates a second row (unique index on
 * customerId+productId) and never double-grants. Existing `credits` are left
 * untouched — this event does not control credits.
 */
async function grantEntitlement({ customer, mapping, event }) {
  const now = new Date();
  const set = {
    provider: PAYMENT_PROVIDERS.JVZOO,
    verified: true,
    verifiedSource: 'jvzoo_ipn',
    lastVerifiedAt: now,
    purchaseStatus: PURCHASE_STATUS.ACTIVE,
    subscriptionStatus: 'active',
    lastPaymentEvent: event.eventType,
    lastEventType: event.eventType,
    accessGrantedAt: now,
    accessRevokedAt: null,
    externalProductId: event.externalProductId || '',
    offerType: mapping.offerType || '',
  };
  if (event.transactionId) {
    set.transactionId = event.transactionId;
    set.orderId = event.transactionId;
  }
  if (event.parentTransactionId) set.parentTransactionId = event.parentTransactionId;
  // An OTO/upgrade carries its own access plan — apply it rather than the FE's.
  if (mapping.accessPlan) set.plan = mapping.accessPlan;
  const meta = { offerType: mapping.offerType, amount: event.amount, currency: event.currency };
  set.providerMetadata = meta;
  set.metadata = meta;

  return CustomerProduct.findOneAndUpdate(
    { customerId: customer._id, productId: mapping.product._id },
    {
      $set: set,
      // purchaseDate is only stamped on first creation, so a rebill does not
      // rewrite the original purchase date.
      $setOnInsert: { purchaseDate: event.occurredAt || now },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

/** Flips an entitlement to a revoked state, preserving the audit trail. */
async function revokeEntitlement(entitlement, event) {
  const statusForEvent =
    event.eventType === PAYMENT_EVENT_TYPES.CHARGEBACK
      ? PURCHASE_STATUS.CHARGEBACK
      : event.eventType === PAYMENT_EVENT_TYPES.CANCEL
        ? PURCHASE_STATUS.CANCELLED
        : PURCHASE_STATUS.REFUNDED;

  entitlement.purchaseStatus = statusForEvent;
  entitlement.subscriptionStatus = SUBSCRIPTION_FOR_STATUS[statusForEvent] || 'cancelled';
  entitlement.lastPaymentEvent = event.eventType;
  entitlement.lastEventType = event.eventType;
  entitlement.accessRevokedAt = new Date();
  // `verified` stays true: the purchase really happened. Access is gated on
  // purchaseStatus, so the admin keeps a truthful, verified history.
  await entitlement.save();
}

async function notifyAccessChange(customer, product, type) {
  if (!customer || !customer.hasPortalAccount) return; // no portal account = no one to notify
  const productDoc = product && product.name ? product : await Product.findById(product).select('name slug');
  if (!productDoc) return;
  const granted = type === NOTIFICATION_TYPES.ACCESS_GRANTED;
  await Notification.push({
    customerId: customer._id,
    type,
    title: granted ? `Access granted: ${productDoc.name}` : `Access changed: ${productDoc.name}`,
    body: granted
      ? `${productDoc.name} is now available in your account.`
      : `Your access to ${productDoc.name} has changed. Contact support if you believe this is a mistake.`,
    link: granted ? `/portal/products/${productDoc.slug}` : '/portal/support',
    productId: productDoc._id,
    refId: productDoc._id,
  }).catch(() => null);
}

/**
 * Safe internal broadcast. Carries only ids and the access status — NEVER a
 * payment payload, email or transaction reference.
 */
function emitAccessUpdated(customerId, productId, purchaseStatus) {
  emitter.toAgents('customer:product-access-updated', {
    customerId: String(customerId),
    productId: String(productId),
    purchaseStatus,
  });
}

/**
 * Records an incoming provider event and applies it, all idempotently.
 * Stores the event BEFORE touching entitlements, so even an event we then fail
 * to process leaves an auditable trace.
 *
 * @returns {{ duplicate, paymentEvent, result? }}
 */
async function ingestEvent({ normalized, verification, redactedPayload, payloadHash, requestMeta }) {
  let paymentEvent;
  try {
    paymentEvent = await PaymentEvent.create({
      provider: PAYMENT_PROVIDERS.JVZOO,
      eventType: normalized.eventType,
      rawEventType: normalized.rawEventType,
      externalEventId: normalized.eventId,
      transactionId: normalized.transactionId,
      parentTransactionId: normalized.parentTransactionId,
      externalProductId: normalized.externalProductId,
      customerEmail: normalized.customerEmail,
      customerName: normalized.customerName,
      amount: normalized.amount,
      currency: normalized.currency,
      status: normalized.rawEventType,
      verificationStatus: verification.status,
      processingStatus: PROCESSING_STATUS.RECEIVED,
      payloadHash: payloadHash || '',
      redactedPayload,
      requestMeta,
      retryCount: 0,
      receivedAt: new Date(),
    });
  } catch (err) {
    if (err.code === 11000) {
      // Idempotent replay: the provider re-sent an event we already have.
      const existing = await PaymentEvent.findOne({
        provider: PAYMENT_PROVIDERS.JVZOO,
        externalEventId: normalized.eventId,
      });
      return { duplicate: true, paymentEvent: existing };
    }
    throw err;
  }

  // Never entitle on anything that did not verify. It is stored (above) for audit.
  if (!verification.ok) {
    paymentEvent.processingStatus = PROCESSING_STATUS.FAILED;
    paymentEvent.processed = false;
    paymentEvent.failureReason = verification.reason || 'verification failed';
    await paymentEvent.save();
    return { duplicate: false, paymentEvent };
  }

  const result = await processPaymentEvent(paymentEvent);
  return { duplicate: false, paymentEvent, result };
}

/**
 * Applies a stored, verified PaymentEvent to the entitlement table and records
 * the outcome. Shared by the webhook path and the admin "reprocess" action, so
 * both behave identically. Only VERIFIED events are ever processed.
 */
async function processPaymentEvent(paymentEvent) {
  if (paymentEvent.verificationStatus !== VERIFICATION_STATUS.VERIFIED) {
    paymentEvent.processingStatus = PROCESSING_STATUS.FAILED;
    paymentEvent.processed = false;
    paymentEvent.failureReason = `cannot process an unverified event (${paymentEvent.verificationStatus})`;
    paymentEvent.retryCount = (paymentEvent.retryCount || 0) + 1;
    await paymentEvent.save();
    return { outcome: 'failed', reason: paymentEvent.failureReason };
  }

  const normalized = {
    eventType: paymentEvent.eventType,
    rawEventType: paymentEvent.rawEventType,
    transactionId: paymentEvent.transactionId,
    parentTransactionId: paymentEvent.parentTransactionId,
    externalProductId: paymentEvent.externalProductId,
    customerEmail: paymentEvent.customerEmail,
    customerName: paymentEvent.customerName,
    amount: paymentEvent.amount,
    currency: paymentEvent.currency,
    occurredAt: paymentEvent.receivedAt,
  };

  let result;
  try {
    result = await applyEvent({ event: normalized });
  } catch (err) {
    logger.error('Entitlement processing failed:', err.message);
    paymentEvent.processingStatus = PROCESSING_STATUS.FAILED;
    paymentEvent.processed = false;
    paymentEvent.failureReason = err.message;
    paymentEvent.retryCount = (paymentEvent.retryCount || 0) + 1;
    await paymentEvent.save();
    return { outcome: 'failed', reason: err.message };
  }

  paymentEvent.retryCount = (paymentEvent.retryCount || 0) + 1;
  if (result.outcome === 'pending_mapping') {
    paymentEvent.processingStatus = PROCESSING_STATUS.PENDING_MAPPING;
    paymentEvent.processed = false;
    paymentEvent.failureReason = result.reason || 'product not mapped';
  } else if (result.outcome === 'ignored') {
    paymentEvent.processingStatus = PROCESSING_STATUS.IGNORED;
    paymentEvent.processed = true;
    paymentEvent.processedAt = new Date();
    paymentEvent.failureReason = result.reason || '';
  } else {
    paymentEvent.processingStatus = PROCESSING_STATUS.PROCESSED;
    paymentEvent.processed = true;
    paymentEvent.processedAt = new Date();
    paymentEvent.failureReason = '';
    if (result.customer) paymentEvent.customerId = result.customer._id;
    if (result.product) paymentEvent.productId = result.product._id;
  }
  await paymentEvent.save();
  return result;
}

module.exports = {
  ingestEvent,
  processPaymentEvent,
  applyEvent,
  grantEntitlement,
  revokeEntitlement,
  resolveMapping,
  findOrCreateCustomerByEmail,
};
