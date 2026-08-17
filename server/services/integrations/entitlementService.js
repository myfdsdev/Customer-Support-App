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
  VERIFICATION_STATUS,
  NOTIFICATION_TYPES,
} = require('../../utils/constants');
const logger = require('../../utils/logger');
const emitter = require('../socket/emitter');

/**
 * Provider-agnostic entitlement lifecycle.
 *
 * A verified purchase grants access; a refund/chargeback/cancel revokes it
 * without deleting history. Everything here is idempotent at the data layer:
 * the PaymentEvent unique index means the same provider event can be delivered
 * any number of times and access is only ever applied once.
 *
 * The AI is never a writer here — only verified provider events, admin CSV
 * imports and admin manual actions reach this code.
 */

/** Maps a purchase status onto the legacy `subscriptionStatus` enum. */
const SUBSCRIPTION_FOR_STATUS = {
  [PURCHASE_STATUS.ACTIVE]: 'active',
  [PURCHASE_STATUS.REFUNDED]: 'refunded',
  [PURCHASE_STATUS.CHARGEBACK]: 'refunded',
  [PURCHASE_STATUS.CANCELLED]: 'cancelled',
  [PURCHASE_STATUS.EXPIRED]: 'expired',
  [PURCHASE_STATUS.PENDING]: 'none',
};

/**
 * Finds the internal product a provider product id maps to.
 * Case-insensitive, and only active products are eligible.
 */
async function findProductForExternalId(externalProductId) {
  const id = String(externalProductId || '').trim();
  if (!id) return null;
  return Product.findOne({ jvzooProductIds: id });
}

/**
 * Finds or creates the Customer for a purchase email, without ever creating a
 * duplicate for an email that already exists (case-insensitively).
 *
 * Does NOT give the customer a portal password — that only happens when the
 * person registers. An imported purchase attaches to whatever record already
 * holds that email, so when they later register on it they "claim" their
 * history automatically.
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
      verifiedSource: 'purchase',
    });
  } catch (err) {
    // Lost a race with a concurrent create on the same email — re-read.
    if (err.code === 11000) return Customer.findOne({ email: normalized });
    throw err;
  }
  return customer;
}

/**
 * Applies one already-VERIFIED, normalised event to the entitlement table.
 *
 * @param {object} args
 * @param {object} args.event      normalized event (see jvzooService.normalize)
 * @param {string} args.provider   PAYMENT_PROVIDERS.*
 * @param {ObjectId} [args.paymentEventId]  the stored PaymentEvent, for backlinks
 * @returns {{ outcome, entitlement?, customer?, product?, reason? }}
 *   outcome ∈ 'granted' | 'revoked' | 'pending_mapping' | 'ignored'
 */
async function applyEvent({ event, provider = PAYMENT_PROVIDERS.JVZOO, paymentEventId = null }) {
  const isGrant = GRANTING_EVENT_TYPES.includes(event.eventType);
  const isRevoke = REVOKING_EVENT_TYPES.includes(event.eventType);

  if (!isGrant && !isRevoke) {
    return { outcome: 'ignored', reason: `event type ${event.eventType} does not change access` };
  }

  const product = await findProductForExternalId(event.productExternalId);

  // Revocations can find their target by transaction id even when the product
  // mapping was removed after the sale, so try that before giving up.
  if (!product && isRevoke) {
    const existing = await CustomerProduct.findOne({ provider, transactionId: event.transactionId });
    if (existing) {
      await revokeEntitlement(existing, event);
      const customer = await Customer.findById(existing.customerId);
      return { outcome: 'revoked', entitlement: existing, customer, product: null };
    }
  }

  if (!product) {
    return { outcome: 'pending_mapping', reason: `no product mapped to external id "${event.productExternalId}"` };
  }

  const customer = await findOrCreateCustomerByEmail({ email: event.customerEmail, name: event.customerName });
  if (!customer) {
    return { outcome: 'ignored', reason: 'event carried no usable customer email' };
  }

  if (isRevoke) {
    const entitlement = await CustomerProduct.findOne({ customerId: customer._id, productId: product._id });
    if (!entitlement) {
      return { outcome: 'ignored', reason: 'nothing to revoke for this customer/product' };
    }
    await revokeEntitlement(entitlement, event);
    await notifyAccessChange(customer, product, NOTIFICATION_TYPES.ACCESS_REVOKED);
    emitter.toAgents('entitlement:updated', {
      customerId: String(customer._id),
      productId: String(product._id),
      purchaseStatus: entitlement.purchaseStatus,
    });
    return { outcome: 'revoked', entitlement, customer, product };
  }

  const entitlement = await grantEntitlement({ customer, product, event, provider });
  await notifyAccessChange(customer, product, NOTIFICATION_TYPES.ACCESS_GRANTED);
  emitter.toAgents('entitlement:updated', {
    customerId: String(customer._id),
    productId: String(product._id),
    purchaseStatus: PURCHASE_STATUS.ACTIVE,
  });
  return { outcome: 'granted', entitlement, customer, product };
}

/**
 * Upserts an ACTIVE, verified entitlement. Idempotent: replaying the same sale
 * re-stamps `lastVerifiedAt` but never creates a second row (unique index on
 * customerId+productId) and never double-grants.
 */
async function grantEntitlement({ customer, product, event, provider }) {
  const now = new Date();
  const set = {
    provider,
    verified: true,
    verifiedSource: provider === PAYMENT_PROVIDERS.JVZOO ? 'jvzoo_ipn' : provider,
    lastVerifiedAt: now,
    purchaseStatus: PURCHASE_STATUS.ACTIVE,
    subscriptionStatus: 'active',
    lastEventType: event.eventType,
    accessGrantedAt: now,
    accessRevokedAt: null,
    externalProductId: event.productExternalId || '',
  };
  if (event.transactionId) set.transactionId = event.transactionId;
  if (event.parentTransactionId) set.parentTransactionId = event.parentTransactionId;
  if (event.transactionId) set.orderId = event.transactionId;
  if (event.amount || event.currency) {
    set.metadata = { amount: event.amount, currency: event.currency };
  }

  const entitlement = await CustomerProduct.findOneAndUpdate(
    { customerId: customer._id, productId: product._id },
    {
      $set: set,
      // Only stamp purchaseDate on first creation, so a rebill does not rewrite
      // the original purchase date.
      $setOnInsert: { purchaseDate: now },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return entitlement;
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
  entitlement.lastEventType = event.eventType;
  entitlement.accessRevokedAt = new Date();
  // `verified` stays true: the purchase really happened. Access is gated on
  // purchaseStatus, so the admin keeps a truthful, verified history.
  await entitlement.save();
}

async function notifyAccessChange(customer, product, type) {
  if (!customer.hasPortalAccount) return; // no portal account = no one to notify
  const granted = type === NOTIFICATION_TYPES.ACCESS_GRANTED;
  await Notification.push({
    customerId: customer._id,
    type,
    title: granted ? `Access granted: ${product.name}` : `Access changed: ${product.name}`,
    body: granted
      ? `${product.name} is now available in your account.`
      : `Your access to ${product.name} has changed. Contact support if you believe this is a mistake.`,
    link: granted ? `/portal/products/${product.slug}` : '/portal/support',
    productId: product._id,
    // refId keyed on the access change so grant/revoke each dedupe independently
    refId: product._id,
  }).catch(() => null);
}

/**
 * Records an incoming provider event and applies it, all idempotently.
 *
 * @param {object} args
 * @param {object} args.normalized      provider-agnostic normalized event
 * @param {object} args.verification    { status, ok } from the adapter
 * @param {object} args.redactedPayload safe-to-store request body
 * @param {object} args.requestMeta     { ipHash, userAgent }
 * @param {string} args.provider
 * @returns {{ duplicate, paymentEvent, result? }}
 */
async function ingestEvent({ normalized, verification, redactedPayload, requestMeta, provider = PAYMENT_PROVIDERS.JVZOO }) {
  // Store first, so even an event we then fail to process leaves a trace.
  let paymentEvent;
  try {
    paymentEvent = await PaymentEvent.create({
      provider,
      eventType: normalized.eventType,
      rawEventType: normalized.rawEventType,
      externalEventId: normalized.externalEventId,
      transactionId: normalized.transactionId,
      parentTransactionId: normalized.parentTransactionId,
      productExternalId: normalized.productExternalId,
      customerEmail: normalized.customerEmail,
      customerName: normalized.customerName,
      amount: normalized.amount,
      currency: normalized.currency,
      status: normalized.status,
      verificationStatus: verification.status,
      redactedPayload,
      requestMeta,
      attempts: 1,
      receivedAt: new Date(),
    });
  } catch (err) {
    if (err.code === 11000) {
      // Idempotent replay: the provider re-sent an event we already have.
      const existing = await PaymentEvent.findOne({ provider, externalEventId: normalized.externalEventId });
      return { duplicate: true, paymentEvent: existing };
    }
    throw err;
  }

  // Never entitle on an unverified event. It is stored (above) for audit.
  if (!verification.ok) {
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
 * the outcome on the event. Shared by the webhook path and the admin
 * "reprocess" action, so both behave identically.
 */
async function processPaymentEvent(paymentEvent) {
  const normalized = {
    eventType: paymentEvent.eventType,
    rawEventType: paymentEvent.rawEventType,
    transactionId: paymentEvent.transactionId,
    parentTransactionId: paymentEvent.parentTransactionId,
    productExternalId: paymentEvent.productExternalId,
    customerEmail: paymentEvent.customerEmail,
    customerName: paymentEvent.customerName,
    amount: paymentEvent.amount,
    currency: paymentEvent.currency,
  };

  let result;
  try {
    result = await applyEvent({ event: normalized, provider: paymentEvent.provider, paymentEventId: paymentEvent._id });
  } catch (err) {
    logger.error('Entitlement processing failed:', err.message);
    paymentEvent.processed = false;
    paymentEvent.failureReason = err.message;
    paymentEvent.attempts = (paymentEvent.attempts || 0) + 1;
    await paymentEvent.save();
    return { outcome: 'error', reason: err.message };
  }

  paymentEvent.attempts = (paymentEvent.attempts || 0) + 1;
  if (result.outcome === 'pending_mapping') {
    paymentEvent.processed = false;
    paymentEvent.pendingMapping = true;
    paymentEvent.failureReason = result.reason || 'product not mapped';
  } else {
    paymentEvent.processed = true;
    paymentEvent.pendingMapping = false;
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
  findProductForExternalId,
  findOrCreateCustomerByEmail,
};
