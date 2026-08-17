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
const { OPEN_STATUSES, PRODUCT_PAGE_SECTIONS, CAPABILITIES, roleHasCapability, OFFER_TYPE_LIST } = require('../utils/constants');
const { sanitizeText, sanitizeUrl, sanitizeItems } = require('../utils/sanitize');
const { AuditLog } = require('../models');
const { hashIp } = require('../utils/tokens');

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
  // Rich portal-page content only ever enters through the sanitising PATCH
  // path, never on create — strip it so raw markup can't be stored here.
  delete body.portalPage;
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
    // Membership-portal scalars.
    'purchaseUrl', 'launchUrl', 'accessMode', 'cardImage', 'cardDescription',
    'featured', 'dashboardVisibility', 'sortOrder',
  ];
  fields.forEach((f) => {
    if (req.body[f] !== undefined) product[f] = req.body[f];
  });

  // Merged rather than replaced, so a caller sending only the colours cannot
  // wipe the assistant's name.
  if (req.body.supportPage && typeof req.body.supportPage === 'object') {
    const current = product.supportPage?.toObject?.() || product.supportPage || {};
    product.supportPage = { ...current, ...req.body.supportPage };
  }

  // Structured JVZoo mapping. Rejects an external id already ACTIVE on another
  // product, so a single JVZoo purchase can never grant two internal products
  // by accident. Cross-document uniqueness can't be a Mongo index, so it is an
  // application-level check here. Mapping is an integrations action, gated on
  // the capability even within this shared product route.
  if (req.body.jvzooMappings !== undefined) {
    if (!roleHasCapability(req.user.role, CAPABILITIES.MANAGE_INTEGRATIONS)) {
      throw ApiError.forbidden('Editing JVZoo mappings requires the manage_integrations capability');
    }
    const incoming = Array.isArray(req.body.jvzooMappings) ? req.body.jvzooMappings : [];
    const cleaned = [];
    const seen = new Set();
    for (const m of incoming) {
      const externalProductId = String(m.externalProductId || '').trim();
      if (!externalProductId || seen.has(externalProductId)) continue;
      seen.add(externalProductId);
      cleaned.push({
        externalProductId,
        offerType: OFFER_TYPE_LIST.includes(m.offerType) ? m.offerType : 'fe',
        accessPlan: String(m.accessPlan || '').trim(),
        active: m.active !== false,
      });
    }

    const activeIds = cleaned.filter((m) => m.active).map((m) => m.externalProductId);
    if (activeIds.length) {
      const clash = await Product.findOne({
        _id: { $ne: product._id },
        jvzooMappings: { $elemMatch: { externalProductId: { $in: activeIds }, active: true } },
      }).select('name jvzooMappings');
      if (clash) {
        const clashIds = new Set(
          (clash.jvzooMappings || []).filter((x) => x.active).map((x) => x.externalProductId)
        );
        const overlapping = activeIds.filter((id) => clashIds.has(id));
        throw ApiError.conflict(
          `JVZoo id(s) ${overlapping.join(', ')} are already mapped to "${clash.name}". Remove them there first.`
        );
      }
    }
    product.jvzooMappings = cleaned;
  }

  // Structured, sanitised product-page content. Every string is stripped of
  // markup server-side; every URL is allowlisted to http(s)/relative.
  if (req.body.portalPage && typeof req.body.portalPage === 'object') {
    product.portalPage = buildPortalPage(product.portalPage, req.body.portalPage);
  }

  if (req.body.slug) {
    const slug = slugify(String(req.body.slug), { lower: true, strict: true });
    if (slug !== product.slug) {
      const taken = await Product.findOne({ slug, _id: { $ne: product._id } });
      if (taken) throw ApiError.conflict(`The support URL /support/${slug} is already taken`);
      product.slug = slug;
    }
  }

  await product.save();

  if (req.body.jvzooMappings !== undefined) {
    AuditLog.record({
      actorId: req.user._id,
      actorName: req.user.name,
      actorRole: req.user.role,
      action: 'product.mapping.update',
      targetType: 'product',
      targetId: product._id,
      summary: `Updated JVZoo mappings for ${product.name}`,
      meta: { jvzooMappings: product.jvzooMappings },
      ipHash: hashIp(req.ip),
    });
  }

  res.json({ success: true, data: { ...product.toObject(), supportUrl: `/support/${product.slug}` } });
});

/**
 * Merges an incoming portal-page patch onto the stored one, sanitising every
 * field. Unspecified fields are left untouched, so a caller can PATCH one
 * section without wiping the rest.
 */
function buildPortalPage(current, patch) {
  const base = current?.toObject?.() || current || {};
  const out = { ...base };

  const textFields = {
    heroTitle: 160,
    heroSubtitle: 300,
    overviewContent: 20000,
    gettingStartedContent: 20000,
    howItWorksContent: 20000,
    seoTitle: 160,
    seoDescription: 320,
  };
  for (const [key, max] of Object.entries(textFields)) {
    if (patch[key] !== undefined) out[key] = sanitizeText(patch[key], max);
  }

  const urlFields = ['heroImage', 'heroVideoUrl'];
  for (const key of urlFields) {
    if (patch[key] !== undefined) out[key] = sanitizeUrl(patch[key]);
  }

  if (patch.featureItems !== undefined) {
    out.featureItems = sanitizeItems(patch.featureItems, {
      title: { max: 120 },
      description: { max: 1000 },
      icon: { max: 40 },
      imageUrl: { url: true },
    });
  }
  if (patch.faqItems !== undefined) {
    out.faqItems = sanitizeItems(patch.faqItems, { question: { max: 300 }, answer: { max: 4000 } });
  }
  if (patch.resourceLinks !== undefined) {
    out.resourceLinks = sanitizeItems(patch.resourceLinks, {
      label: { max: 120 },
      url: { url: true },
      description: { max: 400 },
      kind: { max: 20 },
    });
  }

  if (Array.isArray(patch.visibleSections)) {
    out.visibleSections = patch.visibleSections.filter((s) => PRODUCT_PAGE_SECTIONS.includes(s));
  }
  if (Array.isArray(patch.sectionOrder)) {
    out.sectionOrder = patch.sectionOrder.filter((s) => PRODUCT_PAGE_SECTIONS.includes(s));
  }
  if (patch.showTutorials !== undefined) out.showTutorials = Boolean(patch.showTutorials);
  if (patch.showRelated !== undefined) out.showRelated = Boolean(patch.showRelated);
  if (patch.pageStatus !== undefined) out.pageStatus = patch.pageStatus === 'draft' ? 'draft' : 'published';

  return out;
}

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
