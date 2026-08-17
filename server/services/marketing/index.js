'use strict';

const { Recommendation, AnalyticsEvent } = require('../../models');
const { NO_MARKETING_INTENTS } = require('../../utils/constants');
const { normalize } = require('../../utils/text');

/**
 * Support-first recommendation gating.
 *
 * The suppression rules are enforced here, server-side, so no UI change can
 * accidentally start showing an upsell to someone chasing a refund.
 */

const BLOCKING_PHRASES = [
  'refund', 'money back', 'chargeback', 'payment failed', 'charged twice', 'double charge',
  'scam', 'fraud', 'angry', 'furious', 'unacceptable', 'lawyer', 'locked out', 'cant login',
  'cannot login', 'account suspended', 'account banned', 'data loss', 'lost my work',
];

/**
 * @returns {boolean} true when it is acceptable to show a recommendation
 */
function isRecommendationAllowed({ intent, sentiment, text = '', answered = true, escalated = false }) {
  if (escalated) return false;
  if (answered === false) return false;
  if (NO_MARKETING_INTENTS.includes(intent)) return false;
  if (['angry', 'frustrated'].includes(sentiment)) return false;

  const t = normalize(text);
  if (BLOCKING_PHRASES.some((p) => t.includes(p))) return false;

  return true;
}

function liveFilter(placement, sourceProductId) {
  const now = new Date();
  return {
    active: true,
    placement,
    startAt: { $lte: now },
    $and: [
      { $or: [{ endAt: null }, { endAt: { $gte: now } }] },
      { $or: [{ sourceProducts: { $size: 0 } }, { sourceProducts: sourceProductId }] },
    ],
  };
}

/** Recommendations for a static surface (support homepage, training page...). */
async function getPlacementRecommendations({ placement, sourceProductId, limit = 3 }) {
  return Recommendation.find(liveFilter(placement, sourceProductId))
    .populate('promotedProductId', 'name slug logo brandColor websiteUrl')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

/**
 * A contextual suggestion tied to what the customer just asked about — only
 * returned when the gate above allows it and a trigger keyword actually hits.
 */
async function getContextualRecommendation({ sourceProductId, question, intent, sentiment, answered, escalated }) {
  if (!isRecommendationAllowed({ intent, sentiment, text: question, answered, escalated })) return null;

  const q = normalize(question);
  const candidates = await Recommendation.find({
    ...liveFilter('support_homepage', sourceProductId),
    triggerKeywords: { $exists: true, $ne: [] },
  })
    .populate('promotedProductId', 'name slug logo')
    .lean();

  const hit = candidates.find(
    (r) =>
      String(r.promotedProductId?._id || r.promotedProductId) !== String(sourceProductId) &&
      (r.triggerKeywords || []).some((k) => k && q.includes(normalize(k)))
  );

  return hit || null;
}

/**
 * Recommendations for a customer-portal placement.
 *
 * Adds the portal-only targeting rules on top of the standard live filter:
 *   - hide cards for products the customer already owns, unless the card is
 *     explicitly an upgrade/add-on (`excludeExistingOwners: false`);
 *   - honour `targetProducts` (must own one of) and `targetSegments` (tags);
 *   - order by displayOrder then recency.
 *
 * @param {object} args
 * @param {string} args.placement
 * @param {Set<string>} args.ownedProductIds  product ids the customer owns (strings)
 * @param {string[]} args.customerTags
 */
async function getPortalRecommendations({ placement, ownedProductIds = new Set(), customerTags = [], limit = 6 }) {
  const now = new Date();
  const candidates = await Recommendation.find({
    active: true,
    placement,
    startAt: { $lte: now },
    $or: [{ endAt: null }, { endAt: { $gte: now } }],
  })
    .populate('promotedProductId', 'name slug logo brandColor tagline cardImage purchaseUrl')
    .sort({ displayOrder: 1, createdAt: -1 })
    .limit(limit * 3) // over-fetch: some will be filtered out below
    .lean();

  const owned = ownedProductIds instanceof Set ? ownedProductIds : new Set(ownedProductIds.map(String));
  const tags = new Set((customerTags || []).map(String));

  const eligible = candidates.filter((rec) => {
    const promotedId = String(rec.promotedProductId?._id || rec.promotedProductId || '');

    // Don't recommend something the customer already owns unless it's an
    // explicit upgrade/add-on offer.
    if (rec.excludeExistingOwners !== false && owned.has(promotedId)) return false;

    // Ownership requirement (upgrade offers target existing owners).
    if (rec.targetProducts && rec.targetProducts.length) {
      const targeted = rec.targetProducts.map(String);
      if (!targeted.some((id) => owned.has(id))) return false;
    }

    // Segment requirement.
    if (rec.targetSegments && rec.targetSegments.length) {
      if (!rec.targetSegments.some((seg) => tags.has(String(seg)))) return false;
    }

    return true;
  });

  return eligible.slice(0, limit);
}

async function trackImpression(recommendationId, { productId, customerId } = {}) {
  if (!recommendationId) return;
  await Recommendation.updateOne({ _id: recommendationId }, { $inc: { impressions: 1 } }).catch(() => null);
  AnalyticsEvent.track({
    type: AnalyticsEvent.EVENTS.RECOMMENDATION_IMPRESSION,
    productId,
    customerId,
    refId: recommendationId,
  });
}

async function trackClick(recommendationId, { productId, customerId } = {}) {
  if (!recommendationId) return null;
  const rec = await Recommendation.findByIdAndUpdate(recommendationId, { $inc: { clicks: 1 } }, { new: true });
  AnalyticsEvent.track({
    type: AnalyticsEvent.EVENTS.RECOMMENDATION_CLICK,
    productId,
    customerId,
    refId: recommendationId,
    label: rec?.title || '',
  });
  return rec;
}

module.exports = {
  isRecommendationAllowed,
  getPlacementRecommendations,
  getPortalRecommendations,
  getContextualRecommendation,
  trackImpression,
  trackClick,
};
