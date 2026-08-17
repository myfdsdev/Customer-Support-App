'use strict';

const mongoose = require('mongoose');
const {
  PAYMENT_PROVIDERS,
  PAYMENT_PROVIDER_LIST,
  PAYMENT_EVENT_TYPES,
  PAYMENT_EVENT_TYPE_LIST,
  VERIFICATION_STATUS,
  VERIFICATION_STATUS_LIST,
  PROCESSING_STATUS,
  PROCESSING_STATUS_LIST,
} = require('../utils/constants');

/**
 * Append-only audit log of everything a payment provider has told us.
 *
 * Written BEFORE any entitlement is touched, so a webhook that later fails to
 * process still leaves a trace an admin can inspect and reprocess. Nothing in
 * here is ever deleted by application code.
 *
 * Idempotency lives in the unique index on (provider, externalEventId): the
 * database, not application logic, is what stops the same event being applied
 * twice when a provider retries.
 */
const paymentEventSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      enum: PAYMENT_PROVIDER_LIST,
      default: PAYMENT_PROVIDERS.JVZOO,
      required: true,
      index: true,
    },
    eventType: {
      type: String,
      enum: PAYMENT_EVENT_TYPE_LIST,
      default: PAYMENT_EVENT_TYPES.UNKNOWN,
      index: true,
    },
    /** Provider's own event identifier, or a deterministic composite we derive. */
    externalEventId: { type: String, required: true },
    /** The provider's raw, unmapped event name — kept for debugging. */
    rawEventType: { type: String, default: '' },

    transactionId: { type: String, default: '', index: true },
    parentTransactionId: { type: String, default: '', index: true },
    /** The JVZoo product id (`cproditem`). */
    externalProductId: { type: String, default: '', index: true },

    customerEmail: { type: String, default: '', lowercase: true, trim: true, index: true },
    customerName: { type: String, default: '' },

    amount: { type: Number, default: 0 },
    currency: { type: String, default: '' },

    /** Provider-reported status string, verbatim. */
    status: { type: String, default: '' },
    verificationStatus: {
      type: String,
      enum: VERIFICATION_STATUS_LIST,
      default: VERIFICATION_STATUS.UNCONFIGURED,
      index: true,
    },

    /**
     * Processing lifecycle, independent of verification. `pending_mapping`
     * means verified-but-no-internal-product; drives the admin "Unmapped
     * events" screen. `processed` is the terminal success state.
     */
    processingStatus: {
      type: String,
      enum: PROCESSING_STATUS_LIST,
      default: PROCESSING_STATUS.RECEIVED,
      index: true,
    },
    /** Convenience boolean mirroring processingStatus === 'processed'. */
    processed: { type: Boolean, default: false, index: true },
    processedAt: { type: Date, default: null },
    failureReason: { type: String, default: '' },

    /** Resolved links, filled in once processing succeeds. */
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },

    /**
     * SHA-256 of the raw request body — a tamper-evident fingerprint that lets
     * an admin confirm two events are byte-identical without storing the raw
     * payload or any secret.
     */
    payloadHash: { type: String, default: '' },
    /**
     * The request as received, with secrets and payment-sensitive fields
     * removed — see jvzooService.redactPayload. Never the IPN secret, card
     * data or full addresses.
     */
    redactedPayload: { type: mongoose.Schema.Types.Mixed, default: {} },
    /** Request metadata useful for abuse investigation. Not the raw IP. */
    requestMeta: {
      ipHash: { type: String, default: '' },
      userAgent: { type: String, default: '' },
    },

    /** How many times processing has been attempted (webhook + admin retries). */
    retryCount: { type: Number, default: 0 },
    receivedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

/**
 * The idempotency constraint. A provider retrying the same notification hits
 * this and is acknowledged without a second entitlement write.
 */
paymentEventSchema.index(
  { provider: 1, externalEventId: 1 },
  { unique: true, name: 'payment_event_idempotency' }
);
paymentEventSchema.index({ provider: 1, transactionId: 1, eventType: 1 });
paymentEventSchema.index({ processingStatus: 1, receivedAt: -1 });
paymentEventSchema.index({ verificationStatus: 1, receivedAt: -1 });

module.exports = mongoose.model('PaymentEvent', paymentEventSchema);
