'use strict';

const asyncHandler = require('../utils/asyncHandler');
const {
  Conversation,
  Customer,
  Product,
  Ticket,
  User,
  Message,
  AnalyticsEvent,
  KnowledgeItem,
  TrainingVideo,
  Recommendation,
} = require('../models');
const presence = require('../services/support/presenceService');
const gemini = require('../services/gemini');
const rag = require('../services/rag');
const { accessibleProductIds } = require('../middleware/auth');
const {
  OPEN_STATUSES,
  CONVERSATION_STATUS,
  TICKET_OPEN_STATUSES,
} = require('../utils/constants');

const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const pct = (n, d) => (d ? Number(((n / d) * 100).toFixed(1)) : 0);

function rangeFilter(days) {
  return { createdAt: { $gte: new Date(Date.now() - Number(days || 30) * 24 * 60 * 60 * 1000) } };
}

/** GET /api/dashboard/stats */
const stats = asyncHandler(async (req, res) => {
  const scope = await accessibleProductIds(req.user);
  const base = scope ? { productId: { $in: scope } } : {};
  const days = Number(req.query.days) || 30;
  const since = rangeFilter(days);

  const [
    onlineSessions,
    activeConversations,
    unassignedConversations,
    openTickets,
    totalCustomers,
    totalProducts,
    agentsOnline,
    resolvedInRange,
  ] = await Promise.all([
    presence.listOnline({ limit: 500 }),
    Conversation.countDocuments({ ...base, status: CONVERSATION_STATUS.ACTIVE }),
    Conversation.countDocuments({ ...base, assignedAgentId: null, status: { $in: OPEN_STATUSES } }),
    Ticket.countDocuments({ ...base, status: { $in: TICKET_OPEN_STATUSES } }),
    Customer.countDocuments(),
    Product.countDocuments({ active: true }),
    User.find({ isOnline: true, status: 'active' }).select('name role avatar lastSeenAt').lean(),
    Conversation.find({
      ...base,
      ...since,
      status: { $in: [CONVERSATION_STATUS.RESOLVED, CONVERSATION_STATUS.CLOSED] },
    })
      .select('resolvedAt firstCustomerMessageAt firstAgentReplyAt aiResolved resolvedByType handoffRequested createdAt')
      .lean(),
  ]);

  const totalInRange = await Conversation.countDocuments({ ...base, ...since });
  const escalated = await Conversation.countDocuments({ ...base, ...since, handoffRequested: true });

  const responseTimes = resolvedInRange
    .filter((c) => c.firstAgentReplyAt && c.firstCustomerMessageAt)
    .map((c) => (new Date(c.firstAgentReplyAt) - new Date(c.firstCustomerMessageAt)) / 1000);

  const resolutionTimes = resolvedInRange
    .filter((c) => c.resolvedAt)
    .map((c) => (new Date(c.resolvedAt) - new Date(c.createdAt)) / 1000);

  const aiResolved = resolvedInRange.filter((c) => c.aiResolved || c.resolvedByType === 'ai').length;
  const humanResolved = resolvedInRange.filter((c) => c.resolvedByType === 'agent').length;

  res.json({
    success: true,
    data: {
      live: {
        customersOnline: onlineSessions.filter((s) => s.presenceStatus === 'online').length,
        activeConversations,
        unassignedConversations,
        openTickets,
        totalCustomers,
        totalProducts,
        agentsOnline,
      },
      analytics: {
        rangeDays: days,
        conversations: totalInRange,
        resolved: resolvedInRange.length,
        avgResponseTimeSeconds: Math.round(avg(responseTimes)),
        avgResolutionTimeSeconds: Math.round(avg(resolutionTimes)),
        aiResolutionRate: pct(aiResolved, resolvedInRange.length),
        humanResolutionRate: pct(humanResolved, resolvedInRange.length),
        escalationRate: pct(escalated, totalInRange),
      },
      system: {
        geminiEnabled: gemini.isEnabled(),
        model: gemini.isEnabled() ? gemini.modelName() : null,
        vectorStore: rag.vectorStore.status(),
      },
    },
  });
});

/** GET /api/dashboard/product-breakdown */
const productBreakdown = asyncHandler(async (req, res) => {
  const scope = await accessibleProductIds(req.user);
  const days = Number(req.query.days) || 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const products = await Product.find(scope ? { _id: { $in: scope } } : {})
    .select('name slug logo brandColor')
    .lean();

  const rows = await Conversation.aggregate([
    { $match: { productId: { $in: products.map((p) => p._id) }, createdAt: { $gte: since } } },
    {
      $group: {
        _id: '$productId',
        conversations: { $sum: 1 },
        escalations: { $sum: { $cond: ['$handoffRequested', 1, 0] } },
        aiResolved: { $sum: { $cond: ['$aiResolved', 1, 0] } },
        open: { $sum: { $cond: [{ $in: ['$status', OPEN_STATUSES] }, 1, 0] } },
      },
    },
  ]);

  const byId = new Map(rows.map((r) => [String(r._id), r]));

  res.json({
    success: true,
    data: products.map((p) => {
      const r = byId.get(String(p._id)) || { conversations: 0, escalations: 0, aiResolved: 0, open: 0 };
      return {
        product: p,
        conversations: r.conversations,
        open: r.open,
        escalations: r.escalations,
        aiResolved: r.aiResolved,
        aiResolutionRate: pct(r.aiResolved, r.conversations),
        escalationRate: pct(r.escalations, r.conversations),
      };
    }),
  });
});

/** GET /api/dashboard/recent — the "needs attention" feed. */
const recent = asyncHandler(async (req, res) => {
  const scope = await accessibleProductIds(req.user);
  const base = scope ? { productId: { $in: scope } } : {};

  const [conversations, tickets] = await Promise.all([
    Conversation.find({ ...base, status: { $in: OPEN_STATUSES } })
      .populate('customerId', 'name email')
      .populate('productId', 'name slug logo')
      .populate('assignedAgentId', 'name avatar')
      .sort({ lastMessageAt: -1 })
      .limit(8)
      .lean(),
    Ticket.find({ ...base, status: { $in: TICKET_OPEN_STATUSES } })
      .populate('customerId', 'name email')
      .populate('productId', 'name slug')
      .sort({ priority: -1, createdAt: -1 })
      .limit(6)
      .lean(),
  ]);

  res.json({ success: true, data: { conversations, tickets } });
});

/**
 * GET /api/analytics
 * Support volume, common questions and — most usefully — the questions the AI
 * could not answer, which is the backlog for the knowledge base.
 */
const analytics = asyncHandler(async (req, res) => {
  const scope = await accessibleProductIds(req.user);
  const days = Number(req.query.days) || 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const productId = req.query.productId || null;

  const match = { createdAt: { $gte: since } };
  if (productId) match.productId = require('mongoose').Types.ObjectId.createFromHexString(String(productId));
  else if (scope) match.productId = { $in: scope };

  const [volumeByDay, byIntent, unanswered, videoStats, recStats, knowledgeUsage, aiCounts] = await Promise.all([
    Conversation.aggregate([
      { $match: match },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Conversation.aggregate([
      { $match: { ...match, detectedIntent: { $ne: '' } } },
      { $group: { _id: '$detectedIntent', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 12 },
    ]),
    AnalyticsEvent.find({ type: AnalyticsEvent.EVENTS.AI_UNANSWERED, ...match })
      .populate('productId', 'name slug')
      .select('label createdAt productId meta')
      .sort({ createdAt: -1 })
      .limit(40)
      .lean(),
    TrainingVideo.find(productId ? { productId } : scope ? { productId: { $in: scope } } : {})
      .select('title recommendedCount clickCount productId')
      .sort({ recommendedCount: -1 })
      .limit(10)
      .lean(),
    Recommendation.find({}).select('title impressions clicks').sort({ impressions: -1 }).limit(10).lean(),
    KnowledgeItem.find(productId ? { productId } : scope ? { productId: { $in: scope } } : {})
      .select('title category usageCount lastUsedAt')
      .sort({ usageCount: -1 })
      .limit(10)
      .lean(),
    AnalyticsEvent.aggregate([
      { $match: { ...match, type: { $in: [AnalyticsEvent.EVENTS.AI_ANSWERED, AnalyticsEvent.EVENTS.AI_UNANSWERED] } } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]),
  ]);

  const answered = aiCounts.find((c) => c._id === AnalyticsEvent.EVENTS.AI_ANSWERED)?.count || 0;
  const notAnswered = aiCounts.find((c) => c._id === AnalyticsEvent.EVENTS.AI_UNANSWERED)?.count || 0;

  // Cheap frequency clustering over first customer messages.
  const commonQuestions = await Message.aggregate([
    { $match: { ...match, senderType: 'customer' } },
    { $project: { key: { $toLower: { $substrCP: ['$content', 0, 60] } } } },
    { $group: { _id: '$key', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 12 },
  ]);

  res.json({
    success: true,
    data: {
      rangeDays: days,
      volumeByDay: volumeByDay.map((v) => ({ date: v._id, count: v.count })),
      byIntent: byIntent.map((i) => ({ intent: i._id, count: i.count })),
      ai: {
        answered,
        unanswered: notAnswered,
        answerRate: pct(answered, answered + notAnswered),
      },
      unansweredQuestions: unanswered.map((u) => ({
        question: u.label,
        product: u.productId,
        reason: u.meta?.reason || '',
        at: u.createdAt,
      })),
      commonQuestions: commonQuestions.map((q) => ({ question: q._id, count: q.count })),
      training: videoStats.map((v) => ({
        title: v.title,
        recommended: v.recommendedCount,
        clicks: v.clickCount,
        ctr: pct(v.clickCount, v.recommendedCount),
      })),
      recommendations: recStats.map((r) => ({
        title: r.title,
        impressions: r.impressions,
        clicks: r.clicks,
        ctr: pct(r.clicks, r.impressions),
      })),
      knowledgeUsage,
    },
  });
});

module.exports = { stats, productBreakdown, recent, analytics };
