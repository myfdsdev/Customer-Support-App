'use strict';

const mongoose = require('mongoose');
const {
  PAYMENT_PROVIDERS,
  PAYMENT_PROVIDER_LIST,
  PURCHASE_STATUS,
  PURCHASE_STATUS_LIST,
} = require('../utils/constants');

/**
 * Link between a customer and a product they use or purchased.
 * Only ever populated from verified sources (admin entry, a verified payment
 * webhook, or an admin CSV import) — the AI is never allowed to write here,
 * and neither is the browser.
 *
 * This is the single entitlement table for the whole platform. Refunds and
 * chargebacks flip `purchaseStatus` and stamp `accessRevokedAt`; they never
 * delete the row, so the admin keeps the full purchase history.
 */
const customerProductSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },

    /* --- original fields, unchanged ---------------------------------- */
    plan: { type: String, default: '' },
    orderId: { type: String, default: '' },
    purchaseDate: { type: Date, default: null },
    subscriptionStatus: {
      type: String,
      enum: ['none', 'trial', 'active', 'past_due', 'cancelled', 'expired', 'refunded'],
      default: 'none',
    },
    credits: { type: Number, default: null },
    verified: { type: Boolean, default: false },
    verifiedSource: { type: String, default: 'manual' },
    lastVerifiedAt: { type: Date, default: null },

    /* --- payment-provider provenance --------------------------------- */
    provider: {
      type: String,
      enum: PAYMENT_PROVIDER_LIST,
      default: PAYMENT_PROVIDERS.MANUAL,
      index: true,
    },
    /** Provider transaction reference. The refund/chargeback lookup key. */
    transactionId: { type: String, default: '', index: true },
    /** Set on rebills and upsells that hang off an original sale. */
    parentTransactionId: { type: String, default: '', index: true },
    /** The provider's own product identifier that granted this entitlement. */
    externalProductId: { type: String, default: '', index: true },

    /**
     * Access state. Separate from `subscriptionStatus` because that field is
     * about the billing relationship while this one is about whether the
     * product may be opened right now.
     */
    purchaseStatus: {
      type: String,
      enum: PURCHASE_STATUS_LIST,
      default: PURCHASE_STATUS.ACTIVE,
      index: true,
    },
    accessGrantedAt: { type: Date, default: null },
    accessRevokedAt: { type: Date, default: null },
    lastEventType: { type: String, default: '' },

    /** Provider extras worth keeping (affiliate, currency, amount). Never PII-heavy. */
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// Pre-existing constraint — one entitlement row per customer/product pair.
// Multiple transactions (FE + OTO) collapse onto the same row by design.
customerProductSchema.index({ customerId: 1, productId: 1 }, { unique: true });

// The portal dashboard's hot query: "active verified products for this person".
customerProductSchema.index({ customerId: 1, purchaseStatus: 1, verified: 1 });
// Refund/chargeback lookup by provider reference.
customerProductSchema.index({ provider: 1, transactionId: 1 });

/** True when this entitlement should currently open the product. */
customerProductSchema.methods.isActive = function isActive() {
  return this.verified === true && this.purchaseStatus === PURCHASE_STATUS.ACTIVE;
};

/** Query fragment for "entitlements that currently grant access". */
customerProductSchema.statics.activeFilter = function activeFilter(customerId) {
  return {
    ...(customerId ? { customerId } : {}),
    verified: true,
    purchaseStatus: PURCHASE_STATUS.ACTIVE,
  };
};

module.exports = mongoose.model('CustomerProduct', customerProductSchema);
