'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { signSupportToken } = require('../utils/tokens');
const {
  Product,
  Customer,
  Conversation,
  Message,
  KnowledgeItem,
  AnalyticsEvent,
  CustomerSession,
} = require('../models');
const support = require('../services/support');
const presence = require('../services/support/presenceService');
const training = require('../services/training');
const marketing = require('../services/marketing');
const rag = require('../services/rag');
const emitter = require('../services/socket/emitter');
const {
  SENDER_TYPE,
  MESSAGE_TYPE,
  CONVERSATION_STATUS,
  OPEN_STATUSES,
} = require('../utils/constants');
const { truncate } = require('../utils/text');

/**
 * Public, unauthenticated customer surface.
 *
 * The product is resolved from the URL slug — the customer never picks one.
 * After POST /session, every subsequent call carries a support token whose
 * productId/sessionId/customerId are the only ids the server will act on.
 */

async function resolveProduct(req) {
  const slug = String(req.params.productSlug || '').toLowerCase();
  const product = await Product.findOne({ slug, active: true });
  if (!product) throw ApiError.notFound(`No support page exists at /support/${slug}`);
  return product;
}

/** GET /api/support/:productSlug — everything the landing page needs. */
const getSupportHome = asyncHandler(async (req, res) => {
  const product = await resolveProduct(req);
  const { announcements, videos, popular, recommendations } = await support.getProductSupportContext(product);

  const categories = await KnowledgeItem.aggregate([
    { $match: { productId: product._id, active: true, status: 'published' } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  recommendations.forEach((r) => marketing.trackImpression(r._id, { productId: product._id }));

  res.json({
    success: true,
    data: {
      product: {
        _id: product._id,
        name: product.name,
        slug: product.slug,
        logo: product.logo,
        description: product.description,
        tagline: product.tagline,
        websiteUrl: product.websiteUrl,
        loginUrl: product.loginUrl,
        docsUrl: product.docsUrl,
        supportEmail: product.supportEmail,
        brandColor: product.brandColor,
        aiWelcomeMessage: product.aiWelcomeMessage,
      },
      announcements,
      videos,
      popularHelp: popular.map((p) => ({
        _id: p._id,
        title: p.title,
        category: p.category,
        summary: p.summary || truncate(p.content, 140),
      })),
      categories: categories.map((c) => ({ category: c._id, count: c.count })),
      recommendations: recommendations.map((r) => ({
        _id: r._id,
        title: r.title,
        description: r.description,
        imageUrl: r.imageUrl,
        ctaText: r.ctaText,
        ctaUrl: r.ctaUrl || (r.promotedProductId?.slug ? `/support/${r.promotedProductId.slug}` : ''),
        product: r.promotedProductId,
      })),
    },
  });
});

/**
 * POST /api/support/:productSlug/session
 * Starts (or resumes) a presence session and returns the support token.
 */
const startSession = asyncHandler(async (req, res) => {
  const product = await resolveProduct(req);
  const { anonymousId, currentPage } = req.body;

  const { session, customer, anonymousId: anonId } = await presence.startSession({
    product,
    anonymousId,
    currentPage: currentPage || `/support/${product.slug}`,
    userAgent: req.headers['user-agent'] || '',
    ip: req.ip,
    referrer: req.headers.referer || '',
  });

  const openConversation = await Conversation.findOne({
    customerId: customer._id,
    productId: product._id,
    status: { $in: OPEN_STATUSES },
  })
    .sort({ lastMessageAt: -1 })
    .lean();

  res.json({
    success: true,
    data: {
      supportToken: signSupportToken({
        sessionId: session._id,
        productId: product._id,
        customerId: customer._id,
        anonymousId: anonId,
      }),
      anonymousId: anonId,
      sessionId: String(session._id),
      customer: {
        _id: customer._id,
        name: customer.name || '',
        email: customer.email || '',
        phone: customer.phone || '',
      },
      conversationId: openConversation ? String(openConversation._id) : null,
      conversationStatus: openConversation ? openConversation.status : null,
      conversationChannel: openConversation ? openConversation.channel : null,
    },
  });
});

/** POST /api/support/:productSlug/session/heartbeat */
const heartbeat = asyncHandler(async (req, res) => {
  const session = await presence.heartbeat({
    sessionId: req.supportSession._id,
    currentPage: req.body.currentPage,
    presenceStatus: req.body.presenceStatus,
  });
  if (!session) throw ApiError.unauthorized('Session no longer active');
  res.json({ success: true, data: { presenceStatus: session.presenceStatus, lastSeenAt: session.lastSeenAt } });
});

/** POST /api/support/:productSlug/session/end */
const endSession = asyncHandler(async (req, res) => {
  await presence.endSession(req.supportSession._id);
  res.json({ success: true, message: 'Session ended' });
});

/** POST /api/support/:productSlug/identify — customer volunteers contact details. */
const identify = asyncHandler(async (req, res) => {
  const { name, email, phone } = req.body;
  const customerId = req.supportCustomerId;
  if (!customerId) throw ApiError.badRequest('No customer attached to this session');

  const customer = await Customer.findById(customerId);
  if (!customer) throw ApiError.notFound('Customer not found');

  // If this email already belongs to a known customer, merge into that record
  // so the agent sees one history instead of two half-profiles.
  if (email) {
    const existing = await Customer.findOne({ email: String(email).toLowerCase(), _id: { $ne: customer._id } });
    if (existing) {
      existing.anonymousIds = [...new Set([...existing.anonymousIds, ...customer.anonymousIds])];
      if (name) existing.name = existing.name || name;
      if (phone) existing.phone = existing.phone || phone;
      existing.lastSeenAt = new Date();
      await existing.save();

      await Promise.all([
        Conversation.updateMany({ customerId: customer._id }, { $set: { customerId: existing._id } }),
        CustomerSession.updateMany({ customerId: customer._id }, { $set: { customerId: existing._id } }),
        Customer.deleteOne({ _id: customer._id }),
      ]);

      emitter.toAgents('customer:updated', { customerId: String(existing._id) });
      return res.json({
        success: true,
        data: { _id: existing._id, name: existing.name, email: existing.email, phone: existing.phone, merged: true },
      });
    }
    customer.email = String(email).toLowerCase();
  }

  if (name) customer.name = name;
  if (phone) customer.phone = phone;
  customer.lastSeenAt = new Date();
  await customer.save();

  emitter.toAgents('customer:updated', { customerId: String(customer._id) });
  return res.json({
    success: true,
    data: { _id: customer._id, name: customer.name, email: customer.email, phone: customer.phone, merged: false },
  });
});

/** GET /api/support/:productSlug/conversation — resume an in-flight chat. */
const getConversation = asyncHandler(async (req, res) => {
  const product = req.product;
  const customerId = req.supportCustomerId;

  const conversation = await Conversation.findOne({
    customerId,
    productId: product._id,
    status: { $in: OPEN_STATUSES },
  })
    .sort({ lastMessageAt: -1 })
    .populate('assignedAgentId', 'name avatar title isOnline')
    .lean();

  if (!conversation) {
    return res.json({ success: true, data: { conversation: null, messages: [] } });
  }

  const messages = await Message.find({ conversationId: conversation._id, isInternal: false })
    .sort({ createdAt: 1 })
    .limit(300)
    .lean();

  return res.json({
    success: true,
    data: {
      conversation: {
        _id: conversation._id,
        status: conversation.status,
        channel: conversation.channel,
        priority: conversation.priority,
        agent: conversation.assignedAgentId || null,
        handoffRequested: conversation.handoffRequested,
        createdAt: conversation.createdAt,
      },
      messages: messages.map((m) => support.serializeMessage(m)),
    },
  });
});

/**
 * POST /api/support/:productSlug/chat
 * The AI turn. When the conversation has already been handed to a human, the
 * message is delivered to the agent instead of being answered by the model.
 */
const chat = asyncHandler(async (req, res) => {
  const product = req.product;
  const content = String(req.body.message || '').trim();
  if (!content) throw ApiError.badRequest('Message cannot be empty');
  if (content.length > 4000) throw ApiError.badRequest('Message is too long (max 4000 characters)');

  const customer = await Customer.findById(req.supportCustomerId);
  if (!customer) throw ApiError.notFound('Customer session is no longer valid');

  const { conversation, created } = await support.getOrCreateConversation({
    customerId: customer._id,
    productId: product._id,
    sessionId: req.supportSession._id,
  });

  if (created) {
    emitter.toAgents('conversation:new', support.serializeConversationLite(conversation));
  }

  // Already with a human: deliver, do not answer.
  if (conversation.channel === 'human') {
    const message = await support.addMessage({
      conversation,
      senderType: SENDER_TYPE.CUSTOMER,
      senderId: customer._id,
      senderName: customer.name || 'Customer',
      content,
    });
    await Conversation.updateOne({ _id: conversation._id }, { $set: { status: CONVERSATION_STATUS.WAITING_TEAM } });
    return res.json({
      success: true,
      data: {
        mode: 'human',
        conversationId: String(conversation._id),
        customerMessage: support.serializeMessage(message),
      },
    });
  }

  const result = await support.handleCustomerMessage({ product, conversation, customer, content });

  return res.json({
    success: true,
    data: {
      mode: result.type === 'handoff' ? 'handoff' : 'ai',
      conversationId: String(conversation._id),
      ...result,
    },
  });
});

/** POST /api/support/:productSlug/handoff — "Talk to Support". */
const handoff = asyncHandler(async (req, res) => {
  const product = req.product;
  const customer = await Customer.findById(req.supportCustomerId);
  if (!customer) throw ApiError.notFound('Customer session is no longer valid');

  const { conversation } = await support.getOrCreateConversation({
    customerId: customer._id,
    productId: product._id,
    sessionId: req.supportSession._id,
  });

  if (conversation.channel === 'human' && conversation.handoffRequested) {
    return res.json({
      success: true,
      data: {
        alreadyRequested: true,
        conversationId: String(conversation._id),
        status: conversation.status,
      },
    });
  }

  const result = await support.requestHumanHandoff({
    product,
    conversation,
    customer,
    reason: req.body.reason || 'Customer requested human support',
    intent: conversation.detectedIntent,
  });

  return res.json({ success: true, data: { conversationId: String(conversation._id), ...result } });
});

/** POST /api/support/:productSlug/feedback — the "Did this solve it?" buttons. */
const feedback = asyncHandler(async (req, res) => {
  const product = req.product;
  const helpful = Boolean(req.body.helpful);

  const conversation = await Conversation.findOne({
    customerId: req.supportCustomerId,
    productId: product._id,
    status: { $in: OPEN_STATUSES },
  }).sort({ lastMessageAt: -1 });

  if (!conversation) throw ApiError.notFound('No active conversation');

  if (helpful) {
    conversation.status = CONVERSATION_STATUS.RESOLVED;
    conversation.resolvedAt = new Date();
    conversation.resolvedByType = 'ai';
    conversation.aiResolved = true;
    conversation.ratings = { helpful: true, ratedAt: new Date() };
    await conversation.save();

    await support.addMessage({
      conversation,
      senderType: SENDER_TYPE.SYSTEM,
      senderName: 'System',
      content: 'Customer confirmed the AI answer resolved their issue.',
      messageType: MESSAGE_TYPE.SYSTEM,
    });

    AnalyticsEvent.track({
      type: AnalyticsEvent.EVENTS.AI_RESOLVED,
      productId: product._id,
      customerId: req.supportCustomerId,
      conversationId: conversation._id,
    });

    emitter.toAgents('conversation:resolved', support.serializeConversationLite(conversation));
    emitter.toConversation(conversation._id, 'conversation:resolved', {
      conversationId: String(conversation._id),
      status: conversation.status,
    });

    // Post-resolution is one of the few moments a suggestion is not intrusive.
    const recs = await marketing.getPlacementRecommendations({
      placement: 'after_resolution',
      sourceProductId: product._id,
      limit: 1,
    });
    const allowed = marketing.isRecommendationAllowed({
      intent: conversation.detectedIntent,
      sentiment: 'neutral',
      text: conversation.lastMessagePreview || '',
      answered: true,
      escalated: false,
    });

    return res.json({
      success: true,
      data: {
        status: conversation.status,
        recommendation: allowed && recs[0] ? recs[0] : null,
      },
    });
  }

  conversation.ratings = { helpful: false, ratedAt: new Date() };
  await conversation.save();
  return res.json({ success: true, data: { status: conversation.status, offerHuman: true } });
});

/** GET /api/support/:productSlug/training */
const listTraining = asyncHandler(async (req, res) => {
  const product = await resolveProduct(req);
  const videos = await training.listVideos({
    productId: product._id,
    category: req.query.category,
    search: req.query.search,
  });
  res.json({ success: true, data: { product: { name: product.name, slug: product.slug }, videos } });
});

/** POST /api/support/:productSlug/training/:videoId/click */
const trackVideoClick = asyncHandler(async (req, res) => {
  const product = await resolveProduct(req);
  const video = await training.trackClick({
    videoId: req.params.videoId,
    productId: product._id,
    customerId: req.supportCustomerId || null,
  });
  if (!video) throw ApiError.notFound('Training video not found for this product');
  res.json({ success: true, data: { videoUrl: video.videoUrl } });
});

/** GET /api/support/:productSlug/help */
const listHelp = asyncHandler(async (req, res) => {
  const product = await resolveProduct(req);
  const articles = await rag.searchArticles({
    productId: product._id,
    query: req.query.q,
    category: req.query.category,
    limit: Number(req.query.limit) || 30,
  });

  const categories = await KnowledgeItem.aggregate([
    { $match: { productId: product._id, active: true, status: 'published' } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  res.json({
    success: true,
    data: {
      product: { name: product.name, slug: product.slug },
      categories: categories.map((c) => ({ category: c._id, count: c.count })),
      articles: articles.map((a) => ({
        _id: a._id,
        title: a.title,
        category: a.category,
        summary: a.summary || truncate(a.content, 180),
      })),
    },
  });
});

/** GET /api/support/:productSlug/help/:articleId */
const getHelpArticle = asyncHandler(async (req, res) => {
  const product = await resolveProduct(req);
  const article = await KnowledgeItem.findOne({
    _id: req.params.articleId,
    productId: product._id, // hard tenant check: no cross-product article reads
    active: true,
    status: 'published',
  })
    .select('title category content summary keywords updatedAt')
    .lean();

  if (!article) throw ApiError.notFound('Article not found');

  AnalyticsEvent.track({
    type: AnalyticsEvent.EVENTS.KNOWLEDGE_VIEWED,
    productId: product._id,
    refId: article._id,
    label: article.title,
  });

  const related = await rag.searchArticles({ productId: product._id, query: article.title, limit: 4 });

  res.json({
    success: true,
    data: {
      article,
      related: related.filter((r) => String(r._id) !== String(article._id)).slice(0, 3),
    },
  });
});

/** POST /api/support/:productSlug/recommendations/:id/click */
const trackRecommendationClick = asyncHandler(async (req, res) => {
  const product = await resolveProduct(req);
  const rec = await marketing.trackClick(req.params.id, {
    productId: product._id,
    customerId: req.supportCustomerId || null,
  });
  if (!rec) throw ApiError.notFound('Recommendation not found');
  res.json({ success: true, data: { ctaUrl: rec.ctaUrl } });
});

/** POST /api/support/:productSlug/upload — customer screenshot/attachment. */
const uploadAttachment = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('No file received');
  const product = req.product;

  const customer = await Customer.findById(req.supportCustomerId);
  if (!customer) throw ApiError.notFound('Customer session is no longer valid');

  const { conversation } = await support.getOrCreateConversation({
    customerId: customer._id,
    productId: product._id,
    sessionId: req.supportSession._id,
  });

  const isImage = req.file.mimetype.startsWith('image/');
  const message = await support.addMessage({
    conversation,
    senderType: SENDER_TYPE.CUSTOMER,
    senderId: customer._id,
    senderName: customer.name || 'Customer',
    content: req.body.caption || '',
    messageType: isImage ? MESSAGE_TYPE.IMAGE : MESSAGE_TYPE.FILE,
    attachment: {
      url: `/uploads/${req.file.filename}`,
      name: req.file.originalname,
      type: req.file.mimetype,
      size: req.file.size,
    },
  });

  res.status(201).json({ success: true, data: support.serializeMessage(message) });
});

module.exports = {
  getSupportHome,
  startSession,
  heartbeat,
  endSession,
  identify,
  getConversation,
  chat,
  handoff,
  feedback,
  listTraining,
  trackVideoClick,
  listHelp,
  getHelpArticle,
  trackRecommendationClick,
  uploadAttachment,
};
