'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Recommendation } = require('../models');
const { RECOMMENDATION_PLACEMENTS } = require('../utils/constants');

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
    name,
    promotedProductId,
    title,
    description: req.body.description || '',
    imageUrl: req.body.imageUrl || '',
    ctaText: req.body.ctaText || 'Learn more',
    ctaUrl: req.body.ctaUrl || '',
    sourceProducts: parseList(req.body.sourceProducts),
    placement: RECOMMENDATION_PLACEMENTS.includes(req.body.placement) ? req.body.placement : 'support_homepage',
    triggerKeywords: parseList(req.body.triggerKeywords),
    startAt: req.body.startAt || new Date(),
    endAt: req.body.endAt || null,
    frequencyLimit: Number(req.body.frequencyLimit) || 1,
    active: req.body.active !== undefined ? Boolean(req.body.active) : true,
  });

  res.status(201).json({ success: true, data: recommendation });
});

/** PATCH /api/recommendations/:id */
const updateRecommendation = asyncHandler(async (req, res) => {
  const rec = await Recommendation.findById(req.params.id);
  if (!rec) throw ApiError.notFound('Recommendation not found');

  ['name', 'title', 'description', 'imageUrl', 'ctaText', 'ctaUrl', 'promotedProductId'].forEach((f) => {
    if (req.body[f] !== undefined) rec[f] = req.body[f];
  });
  if (req.body.sourceProducts !== undefined) rec.sourceProducts = parseList(req.body.sourceProducts);
  if (req.body.triggerKeywords !== undefined) rec.triggerKeywords = parseList(req.body.triggerKeywords);
  if (req.body.placement !== undefined && RECOMMENDATION_PLACEMENTS.includes(req.body.placement)) {
    rec.placement = req.body.placement;
  }
  if (req.body.startAt !== undefined) rec.startAt = req.body.startAt;
  if (req.body.endAt !== undefined) rec.endAt = req.body.endAt || null;
  if (req.body.frequencyLimit !== undefined) rec.frequencyLimit = Number(req.body.frequencyLimit) || 1;
  if (req.body.active !== undefined) rec.active = Boolean(req.body.active);

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
