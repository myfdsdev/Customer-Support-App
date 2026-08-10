'use strict';

const mongoose = require('mongoose');
const { RECOMMENDATION_PLACEMENTS } = require('../utils/constants');

/**
 * A subtle cross-product suggestion. Deliberately never rendered during
 * refunds, payment failures, lockouts, serious bugs or complaints — that rule
 * lives in services/marketing and is enforced server-side, not in the UI.
 */
const recommendationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    promotedProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },

    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 1000 },
    imageUrl: { type: String, default: '' },
    ctaText: { type: String, default: 'Learn more' },
    ctaUrl: { type: String, default: '' },

    /** Empty = eligible on every product's support surface. */
    sourceProducts: { type: [mongoose.Schema.Types.ObjectId], ref: 'Product', default: [] },
    placement: { type: String, enum: RECOMMENDATION_PLACEMENTS, default: 'support_homepage', index: true },

    /** Contextual trigger words, e.g. "thumbnail" -> Thumb Generator. */
    triggerKeywords: { type: [String], default: [] },

    startAt: { type: Date, default: Date.now },
    endAt: { type: Date, default: null },
    frequencyLimit: { type: Number, default: 1 }, // max impressions per customer
    active: { type: Boolean, default: true, index: true },

    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
  },
  { timestamps: true }
);

recommendationSchema.index({ placement: 1, active: 1 });

module.exports = mongoose.model('Recommendation', recommendationSchema);
