'use strict';

const mongoose = require('mongoose');

/**
 * Link between a customer and a product they use or purchased.
 * Only ever populated from verified sources (admin entry or a payment
 * integration) — the AI is never allowed to write here.
 */
const customerProductSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
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
  },
  { timestamps: true }
);

customerProductSchema.index({ customerId: 1, productId: 1 }, { unique: true });

module.exports = mongoose.model('CustomerProduct', customerProductSchema);
