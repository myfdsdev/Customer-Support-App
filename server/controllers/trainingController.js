'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { TrainingVideo, Product } = require('../models');
const rag = require('../services/rag');
const { accessibleProductIds } = require('../middleware/auth');

function parseList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,\n]/).map((v) => v.trim()).filter(Boolean);
  return [];
}

/** GET /api/training */
const listVideos = asyncHandler(async (req, res) => {
  const { productId, category, active, search } = req.query;

  const filter = {};
  if (productId) {
    filter.productId = productId;
  } else {
    const scope = await accessibleProductIds(req.user);
    if (scope) filter.productId = { $in: scope };
  }
  if (category) filter.category = category;
  if (active !== undefined && active !== '') filter.active = active === 'true';
  if (search) filter.$or = [{ title: new RegExp(search, 'i') }, { feature: new RegExp(search, 'i') }];

  const videos = await TrainingVideo.find(filter)
    .populate('productId', 'name slug')
    .select('-embedding')
    .sort({ sortOrder: 1, createdAt: -1 })
    .lean();

  res.json({ success: true, data: videos });
});

/** GET /api/training/:id */
const getVideo = asyncHandler(async (req, res) => {
  const video = await TrainingVideo.findById(req.params.id).select('-embedding').populate('productId', 'name slug').lean();
  if (!video) throw ApiError.notFound('Training video not found');
  res.json({ success: true, data: video });
});

/** POST /api/training */
const createVideo = asyncHandler(async (req, res) => {
  const { productId, title, videoUrl } = req.body;
  if (!productId) throw ApiError.badRequest('productId is required — videos cannot be global');
  if (!title || !videoUrl) throw ApiError.badRequest('title and videoUrl are required');

  const product = await Product.findById(productId);
  if (!product) throw ApiError.notFound('Product not found');

  const video = await TrainingVideo.create({
    productId,
    title,
    description: req.body.description || '',
    feature: req.body.feature || '',
    category: req.body.category || 'Tutorial',
    keywords: parseList(req.body.keywords),
    questionVariations: parseList(req.body.questionVariations),
    videoUrl,
    thumbnailUrl: req.body.thumbnailUrl || '',
    duration: Number(req.body.duration) || 0,
    sortOrder: Number(req.body.sortOrder) || 0,
    active: req.body.active !== undefined ? Boolean(req.body.active) : true,
  });

  await rag.indexTrainingVideo(video);
  res.status(201).json({ success: true, data: video });
});

/** PATCH /api/training/:id */
const updateVideo = asyncHandler(async (req, res) => {
  const video = await TrainingVideo.findById(req.params.id);
  if (!video) throw ApiError.notFound('Training video not found');

  ['title', 'description', 'feature', 'category', 'videoUrl', 'thumbnailUrl'].forEach((f) => {
    if (req.body[f] !== undefined) video[f] = req.body[f];
  });
  if (req.body.keywords !== undefined) video.keywords = parseList(req.body.keywords);
  if (req.body.questionVariations !== undefined) video.questionVariations = parseList(req.body.questionVariations);
  if (req.body.duration !== undefined) video.duration = Number(req.body.duration) || 0;
  if (req.body.sortOrder !== undefined) video.sortOrder = Number(req.body.sortOrder) || 0;
  if (req.body.active !== undefined) video.active = Boolean(req.body.active);

  await video.save();
  await rag.indexTrainingVideo(video);

  const obj = video.toObject();
  delete obj.embedding;
  res.json({ success: true, data: obj });
});

/** DELETE /api/training/:id */
const deleteVideo = asyncHandler(async (req, res) => {
  const video = await TrainingVideo.findByIdAndDelete(req.params.id);
  if (!video) throw ApiError.notFound('Training video not found');
  res.json({ success: true, message: 'Training video deleted' });
});

/** PATCH /api/training/:id/toggle */
const toggleVideo = asyncHandler(async (req, res) => {
  const video = await TrainingVideo.findById(req.params.id);
  if (!video) throw ApiError.notFound('Training video not found');
  video.active = !video.active;
  await video.save();
  res.json({ success: true, data: { _id: video._id, active: video.active } });
});

module.exports = { listVideos, getVideo, createVideo, updateVideo, deleteVideo, toggleVideo };
