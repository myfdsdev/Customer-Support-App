'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { KnowledgeItem, KnowledgeChunk, Product } = require('../models');
const { KNOWLEDGE_CATEGORIES } = require('../utils/constants');
const rag = require('../services/rag');
const { accessibleProductIds } = require('../middleware/auth');

/**
 * Knowledge is always product-scoped. Every read here either filters by an
 * explicit productId or by the set of products the user may access — there is
 * no unscoped "all knowledge" query.
 */

/** GET /api/knowledge */
const listKnowledge = asyncHandler(async (req, res) => {
  const { productId, category, active, search, status, page = 1, limit = 50 } = req.query;

  const filter = {};
  if (productId) {
    filter.productId = productId;
  } else {
    const scope = await accessibleProductIds(req.user);
    if (scope) filter.productId = { $in: scope };
  }
  if (category) filter.category = category;
  if (status) filter.status = status;
  if (active !== undefined && active !== '') filter.active = active === 'true';
  if (search) {
    filter.$or = [
      { title: new RegExp(search, 'i') },
      { content: new RegExp(search, 'i') },
      { keywords: new RegExp(search, 'i') },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    KnowledgeItem.find(filter)
      .populate('productId', 'name slug')
      .select('-content')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    KnowledgeItem.countDocuments(filter),
  ]);

  res.json({ success: true, data: items, meta: { total, page: Number(page), limit: Number(limit) } });
});

/** GET /api/knowledge/:id */
const getKnowledge = asyncHandler(async (req, res) => {
  const item = await KnowledgeItem.findById(req.params.id).populate('productId', 'name slug').lean();
  if (!item) throw ApiError.notFound('Knowledge item not found');
  const chunks = await KnowledgeChunk.countDocuments({ knowledgeItemId: item._id });
  res.json({ success: true, data: { ...item, chunkCount: chunks } });
});

function parseList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((v) => v.trim()).filter(Boolean);
  return [];
}

/** POST /api/knowledge */
const createKnowledge = asyncHandler(async (req, res) => {
  const { productId, category, title, content } = req.body;
  if (!productId) throw ApiError.badRequest('productId is required — knowledge cannot be global');
  if (!KNOWLEDGE_CATEGORIES.includes(category)) throw ApiError.badRequest('Invalid category');

  const product = await Product.findById(productId);
  if (!product) throw ApiError.notFound('Product not found');

  const item = await KnowledgeItem.create({
    productId,
    category,
    title,
    content,
    summary: req.body.summary || '',
    keywords: parseList(req.body.keywords),
    tags: parseList(req.body.tags),
    sourceType: req.body.sourceType || 'manual',
    sourceUrl: req.body.sourceUrl || '',
    active: req.body.active !== undefined ? Boolean(req.body.active) : true,
    status: req.body.status || 'published',
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  // Index synchronously so the answer is retrievable on the very next question.
  const indexed = await rag.indexKnowledgeItem(item);

  res.status(201).json({ success: true, data: { ...item.toObject(), ...indexed } });
});

/** PATCH /api/knowledge/:id */
const updateKnowledge = asyncHandler(async (req, res) => {
  const item = await KnowledgeItem.findById(req.params.id);
  if (!item) throw ApiError.notFound('Knowledge item not found');

  const before = { content: item.content, title: item.title, active: item.active, status: item.status };

  ['title', 'content', 'summary', 'category', 'sourceType', 'sourceUrl', 'status'].forEach((f) => {
    if (req.body[f] !== undefined) item[f] = req.body[f];
  });
  if (req.body.keywords !== undefined) item.keywords = parseList(req.body.keywords);
  if (req.body.tags !== undefined) item.tags = parseList(req.body.tags);
  if (req.body.active !== undefined) item.active = Boolean(req.body.active);
  item.updatedBy = req.user._id;

  await item.save();

  // Re-embedding costs an API call, so only do it when retrieval input changed.
  const needsReindex =
    before.content !== item.content ||
    before.title !== item.title ||
    before.active !== item.active ||
    before.status !== item.status;

  const indexed = needsReindex ? await rag.indexKnowledgeItem(item) : { chunks: item.chunkCount, embedded: null };

  res.json({ success: true, data: { ...item.toObject(), ...indexed } });
});

/** DELETE /api/knowledge/:id */
const deleteKnowledge = asyncHandler(async (req, res) => {
  const item = await KnowledgeItem.findByIdAndDelete(req.params.id);
  if (!item) throw ApiError.notFound('Knowledge item not found');
  await rag.removeKnowledgeItemIndex(item._id);
  res.json({ success: true, message: 'Knowledge item deleted' });
});

/** PATCH /api/knowledge/:id/toggle */
const toggleKnowledge = asyncHandler(async (req, res) => {
  const item = await KnowledgeItem.findById(req.params.id);
  if (!item) throw ApiError.notFound('Knowledge item not found');
  item.active = !item.active;
  await item.save();
  await rag.indexKnowledgeItem(item);
  res.json({ success: true, data: { _id: item._id, active: item.active } });
});

/**
 * POST /api/knowledge/test-retrieval
 * Lets an admin see exactly which chunks a question retrieves for a product —
 * the fastest way to debug "why did the AI say it doesn't know?".
 */
const testRetrieval = asyncHandler(async (req, res) => {
  const { productId, question } = req.body;
  if (!productId || !question) throw ApiError.badRequest('productId and question are required');

  const { chunks, strategy, embedded } = await rag.retrieve({ productId, question });
  const videos = await require('../services/training').findRelevantVideos({ productId, question, limit: 3 });

  res.json({
    success: true,
    data: {
      strategy,
      embedded,
      vectorStore: rag.vectorStore.status(),
      chunks: chunks.map((c) => ({
        _id: c._id,
        knowledgeItemId: c.knowledgeItemId,
        title: c.title,
        category: c.category,
        score: c.score,
        preview: String(c.content).slice(0, 300),
      })),
      videos: videos.map((v) => ({ _id: v._id, title: v.title, score: v.score })),
    },
  });
});

/** POST /api/knowledge/reindex */
const reindex = asyncHandler(async (req, res) => {
  const result = await rag.reindexAll({ productId: req.body.productId || null });
  res.json({ success: true, data: result });
});

/** GET /api/knowledge/categories */
const categories = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: KNOWLEDGE_CATEGORIES });
});

module.exports = {
  listKnowledge,
  getKnowledge,
  createKnowledge,
  updateKnowledge,
  deleteKnowledge,
  toggleKnowledge,
  testRetrieval,
  reindex,
  categories,
};
