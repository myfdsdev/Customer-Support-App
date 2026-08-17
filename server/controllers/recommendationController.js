'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Recommendation } = require('../models');
const { RECOMMENDATION_PLACEMENTS, RECOMMENDATION_BADGES } = require('../utils/constants');
const { sanitizeText, sanitizeUrl } = require('../utils/sanitize');

/** GET /api/recommendations */
const listRecommendations = asyncHandler(async (req, res) => {
  const { placement, active, promotedProductId } = req.query;
  const filter = {};
  if (placement) filter.placement = placement;
  if (promotedProductId) filter.promotedProductId = promotedProductId;
  if (active !== undefined && active !== '') filter.active = active === 'true';

  const recommendations = await Recommendation.find(filter)
    .populate('promotedProductId', 'name slug logo')
    .populate('sourceProducts', 'name slug')
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    success: true,
    data: recommendations.map((r) => ({
      ...r,
      ctr: r.impressions ? Number(((r.clicks / r.impressions) * 100).toFixed(1)) : 0,
    })),
    meta: { placements: RECOMMENDATION_PLACEMENTS },
  });
});

const parseList = (v) =>
  Array.isArray(v) ? v : typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];

/** POST /api/recommendations */
const createRecommendation = asyncHandler(async (req, res) => {
  const { name, promotedProductId, title } = req.body;
  if (!name || !promotedProductId || !title) {
    throw ApiError.badRequest('name, promotedProductId and title are required');
  }

  const recommendation = await Recommendation.create({
    name: sanitizeText(name, 120),
    promotedProductId,
    title: sanitizeText(title, 200),
    description: sanitizeText(req.body.description || '', 1000),
    imageUrl: sanitizeUrl(req.body.imageUrl || ''),
    ctaText: sanitizeText(req.body.ctaText || 'Learn more', 60),
    ctaUrl: sanitizeUrl(req.body.ctaUrl || ''),
    sourceProducts: parseList(req.body.sourceProducts),
    placement: RECOMMENDATION_PLACEMENTS.includes(req.body.placement) ? req.body.placement : 'support_homepage',
    triggerKeywords: parseList(req.body.triggerKeywords),
    startAt: req.body.startAt || new Date(),
    endAt: req.body.endAt || null,
    frequencyLimit: Number(req.body.frequencyLimit) || 1,
    active: req.body.active !== undefined ? Boolean(req.body.active) : true,
    // Portal targeting.
    badge: RECOMMENDATION_BADGES.includes(req.body.badge) ? req.body.badge : 'Recommended',
    excludeExistingOwners: req.body.excludeExistingOwners !== undefined ? Boolean(req.body.excludeExistingOwners) : true,
    targetProducts: parseList(req.body.targetProducts),
    targetSegments: parseList(req.body.targetSegments),
    internalDestination: sanitizeUrl(req.body.internalDestination, { allowRelative: true }),
    displayOrder: Number(req.body.displayOrder) || 0,
  });

  res.status(201).json({ success: true, data: recommendation });
});

/** PATCH /api/recommendations/:id */
const updateRecommendation = asyncHandler(async (req, res) => {
  const rec = await Recommendation.findById(req.params.id);
  if (!rec) throw ApiError.notFound('Recommendation not found');

  if (req.body.promotedProductId !== undefined) rec.promotedProductId = req.body.promotedProductId;
  if (req.body.name !== undefined) rec.name = sanitizeText(req.body.name, 120);
  if (req.body.title !== undefined) rec.title = sanitizeText(req.body.title, 200);
  if (req.body.description !== undefined) rec.description = sanitizeText(req.body.description, 1000);
  if (req.body.ctaText !== undefined) rec.ctaText = sanitizeText(req.body.ctaText, 60);
  if (req.body.imageUrl !== undefined) rec.imageUrl = sanitizeUrl(req.body.imageUrl);
  if (req.body.ctaUrl !== undefined) rec.ctaUrl = sanitizeUrl(req.body.ctaUrl);
  if (req.body.sourceProducts !== undefined) rec.sourceProducts = parseList(req.body.sourceProducts);
  if (req.body.triggerKeywords !== undefined) rec.triggerKeywords = parseList(req.body.triggerKeywords);
  if (req.body.placement !== undefined && RECOMMENDATION_PLACEMENTS.includes(req.body.placement)) {
    rec.placement = req.body.placement;
  }
  if (req.body.startAt !== undefined) rec.startAt = req.body.startAt;
  if (req.body.endAt !== undefined) rec.endAt = req.body.endAt || null;
  if (req.body.frequencyLimit !== undefined) rec.frequencyLimit = Number(req.body.frequencyLimit) || 1;
  if (req.body.active !== undefined) rec.active = Boolean(req.body.active);
  if (req.body.badge !== undefined && RECOMMENDATION_BADGES.includes(req.body.badge)) rec.badge = req.body.badge;
  if (req.body.excludeExistingOwners !== undefined) rec.excludeExistingOwners = Boolean(req.body.excludeExistingOwners);
  if (req.body.targetProducts !== undefined) rec.targetProducts = parseList(req.body.targetProducts);
  if (req.body.targetSegments !== undefined) rec.targetSegments = parseList(req.body.targetSegments);
  if (req.body.internalDestination !== undefined) rec.internalDestination = sanitizeUrl(req.body.internalDestination, { allowRelative: true });
  if (req.body.displayOrder !== undefined) rec.displayOrder = Number(req.body.displayOrder) || 0;

  await rec.save();
  res.json({ success: true, data: rec });
});

/** DELETE /api/recommendations/:id */
const deleteRecommendation = asyncHandler(async (req, res) => {
  const rec = await Recommendation.findByIdAndDelete(req.params.id);
  if (!rec) throw ApiError.notFound('Recommendation not found');
  res.json({ success: true, message: 'Recommendation deleted' });
});

module.exports = { listRecommendations, createRecommendation, updateRecommendation, deleteRecommendation };
