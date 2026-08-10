'use strict';

const slugify = require('slugify');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const {
  Product,
  ProductAgent,
  KnowledgeItem,
  TrainingVideo,
  Conversation,
  Customer,
  CustomerSession,
} = require('../models');
const { accessibleProductIds } = require('../middleware/auth');
const { OPEN_STATUSES } = require('../utils/constants');

/** GET /api/products */
const listProducts = asyncHandler(async (req, res) => {
  const scope = await accessibleProductIds(req.user);
  const filter = scope ? { _id: { $in: scope } } : {};
  if (req.query.active === 'true') filter.active = true;
  if (req.query.search) filter.name = new RegExp(req.query.search, 'i');

  const products = await Product.find(filter).sort({ createdAt: -1 }).lean();
  const ids = products.map((p) => p._id);

  // One aggregation per metric beats N+1 counts on the products screen.
  const [knowledge, videos, openConvos] = await Promise.all([
    KnowledgeItem.aggregate([{ $match: { productId: { $in: ids } } }, { $group: { _id: '$productId', n: { $sum: 1 } } }]),
    TrainingVideo.aggregate([{ $match: { productId: { $in: ids } } }, { $group: { _id: '$productId', n: { $sum: 1 } } }]),
    Conversation.aggregate([
      { $match: { productId: { $in: ids }, status: { $in: OPEN_STATUSES } } },
      { $group: { _id: '$productId', n: { $sum: 1 } } },
    ]),
  ]);

  const map = (rows) => rows.reduce((acc, r) => ({ ...acc, [String(r._id)]: r.n }), {});
  const k = map(knowledge);
  const v = map(videos);
  const c = map(openConvos);

  res.json({
    success: true,
    data: products.map((p) => ({
      ...p,
      supportUrl: `/support/${p.slug}`,
      counts: {
        knowledge: k[String(p._id)] || 0,
        videos: v[String(p._id)] || 0,
        openConversations: c[String(p._id)] || 0,
      },
    })),
  });
});

/** GET /api/products/:productId */
const getProduct = asyncHandler(async (req, res) => {
  const product = req.product || (await Product.findById(req.params.productId));
  if (!product) throw ApiError.notFound('Product not found');

  const [knowledgeCount, videoCount, agents, openConversations, onlineNow] = await Promise.all([
    KnowledgeItem.countDocuments({ productId: product._id }),
    TrainingVideo.countDocuments({ productId: product._id }),
    ProductAgent.find({ productId: product._id }).populate('agentId', 'name email role avatar isOnline').lean(),
    Conversation.countDocuments({ productId: product._id, status: { $in: OPEN_STATUSES } }),
    CustomerSession.countDocuments({
      productId: product._id,
      endedAt: null,
      lastSeenAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
    }),
  ]);

  res.json({
    success: true,
    data: {
      ...product.toObject(),
      supportUrl: `/support/${product.slug}`,
      counts: { knowledge: knowledgeCount, videos: videoCount, openConversations, onlineNow },
      agents: agents.map((a) => a.agentId).filter(Boolean),
    },
  });
});

/** POST /api/products */
const createProduct = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  if (body.slug) body.slug = slugify(String(body.slug), { lower: true, strict: true });

  const slug = body.slug || slugify(String(body.name || ''), { lower: true, strict: true });
  if (!slug) throw ApiError.badRequest('Could not derive a support slug from the product name');

  const exists = await Product.findOne({ slug });
  if (exists) throw ApiError.conflict(`The support URL /support/${slug} is already taken`);

  const product = await Product.create({ ...body, slug });
  res.status(201).json({ success: true, data: { ...product.toObject(), supportUrl: `/support/${product.slug}` } });
});

/** PATCH /api/products/:productId */
const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.productId);
  if (!product) throw ApiError.notFound('Product not found');

  const fields = [
    'name', 'logo', 'description', 'tagline', 'websiteUrl', 'loginUrl', 'docsUrl',
    'supportEmail', 'brandColor', 'aiWelcomeMessage', 'aiPersona', 'active',
  ];
  fields.forEach((f) => {
    if (req.body[f] !== undefined) product[f] = req.body[f];
  });

  if (req.body.slug) {
    const slug = slugify(String(req.body.slug), { lower: true, strict: true });
    if (slug !== product.slug) {
      const taken = await Product.findOne({ slug, _id: { $ne: product._id } });
      if (taken) throw ApiError.conflict(`The support URL /support/${slug} is already taken`);
      product.slug = slug;
    }
  }

  await product.save();
  res.json({ success: true, data: { ...product.toObject(), supportUrl: `/support/${product.slug}` } });
});

/** DELETE /api/products/:productId */
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.productId);
  if (!product) throw ApiError.notFound('Product not found');

  const conversations = await Conversation.countDocuments({ productId: product._id });
  if (conversations > 0 && req.query.force !== 'true') {
    throw ApiError.badRequest(
      `${product.name} has ${conversations} conversation(s). Deactivate it instead, or pass force=true to delete anyway.`
    );
  }

  await Promise.all([
    Product.deleteOne({ _id: product._id }),
    ProductAgent.deleteMany({ productId: product._id }),
    KnowledgeItem.deleteMany({ productId: product._id }),
    TrainingVideo.deleteMany({ productId: product._id }),
    require('../models').KnowledgeChunk.deleteMany({ productId: product._id }),
  ]);

  res.json({ success: true, message: `${product.name} deleted` });
});

/** PUT /api/products/:productId/agents */
const setProductAgents = asyncHandler(async (req, res) => {
  const { agentIds = [] } = req.body;
  const productId = req.params.productId;

  await ProductAgent.deleteMany({ productId });
  if (agentIds.length) {
    await ProductAgent.insertMany(
      agentIds.map((agentId) => ({ productId, agentId })),
      { ordered: false }
    ).catch(() => null);
  }

  const agents = await ProductAgent.find({ productId }).populate('agentId', 'name email role avatar').lean();
  res.json({ success: true, data: agents.map((a) => a.agentId).filter(Boolean) });
});

/** GET /api/products/:productId/customers */
const productCustomers = asyncHandler(async (req, res) => {
  const conversations = await Conversation.find({ productId: req.params.productId })
    .select('customerId')
    .lean();
  const ids = [...new Set(conversations.map((c) => String(c.customerId)))];
  const customers = await Customer.find({ _id: { $in: ids } }).sort({ lastSeenAt: -1 }).limit(100).lean();
  res.json({ success: true, data: customers });
});

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  setProductAgents,
  productCustomers,
};
