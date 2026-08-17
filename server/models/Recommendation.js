'use strict';

const mongoose = require('mongoose');
const { RECOMMENDATION_PLACEMENTS, RECOMMENDATION_BADGES } = require('../utils/constants');

/**
 * A subtle cross-product suggestion. Deliberately never rendered during
 * refunds, payment failures, lockouts, serious bugs or complaints — that rule
 * lives in services/marketing and is enforced server-side, not in the UI.
 */
const recommendationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    promotedProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },

    /**
     * Disclosure label. Required by the portal's advertising rules: a card on
     * the customer dashboard always carries one of these so it can never read
     * as neutral product information.
     */
    badge: { type: String, enum: RECOMMENDATION_BADGES, default: 'Recommended' },

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

    /* --- portal targeting -------------------------------------------- */

    /**
     * Hide this card from customers who already own the promoted product.
     * Defaults to true: recommending someone a thing they have already paid
     * for is the fastest way to make the dashboard feel untrustworthy. Turn it
     * off deliberately for upgrade and add-on offers.
     */
    excludeExistingOwners: { type: Boolean, default: true },

    /**
     * Only show to customers who own at least one of these products. Empty =
     * no ownership requirement.
     */
    targetProducts: { type: [mongoose.Schema.Types.ObjectId], ref: 'Product', default: [] },
    /** Customer tags this card is limited to. Empty = every segment. */
    targetSegments: { type: [String], default: [] },

    /**
     * Internal destination, e.g. `/portal/products/my-app`. Preferred over
     * ctaUrl for anything inside the portal so the customer is never bounced
     * out of the app to reach their own content.
     */
    internalDestination: { type: String, default: '', trim: true },

    /** Lower renders first within a placement. */
    displayOrder: { type: Number, default: 0, index: true },

    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
  },
  { timestamps: true }
);

recommendationSchema.index({ placement: 1, active: 1 });
recommendationSchema.index({ placement: 1, active: 1, startAt: 1, endAt: 1, displayOrder: 1 });

module.exports = mongoose.model('Recommendation', recommendationSchema);
