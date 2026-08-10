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
    .populate('promotedProductId', 'name slug logo brandColor')
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
  getContextualRecommendation,
  trackImpression,
  trackClick,
};
