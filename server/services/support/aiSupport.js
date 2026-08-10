'use strict';

const logger = require('../../utils/logger');
const gemini = require('../gemini');
const rag = require('../rag');
const training = require('../training');
const marketing = require('../marketing');
const { getVerifiedAccountData } = require('./verifiedData');
const conversationService = require('./conversationService');
const emitter = require('../socket/emitter');
const { truncate } = require('../../utils/text');

const {
  Conversation,
  Customer,
  TrainingVideo,
  AnalyticsEvent,
  Product,
} = require('../../models');
const {
  SENDER_TYPE,
  MESSAGE_TYPE,
  CONVERSATION_STATUS,
  PRIORITY,
  INTENTS,
} = require('../../utils/constants');

/**
 * The AI support turn, end to end.
 *
 *   customer message -> intent -> product-scoped retrieval -> video match
 *   -> verified account data -> grounded answer -> persist -> broadcast
 *
 * `productId` threads through every retrieval call, so a VideoClawBot customer
 * can only ever be answered from VideoClawBot knowledge.
 */

const RANK = { low: 0, normal: 1, high: 2, urgent: 3 };

async function handleCustomerMessage({
  product,
  conversation,
  customer,
  content,
  clientMessageId = null,
  onCustomerMessage,
}) {
  const productId = product._id;

  // 1. Persist the customer's message first so nothing is lost if AI fails.
  const customerMessage = await conversationService.addMessage({
    conversation,
    senderType: SENDER_TYPE.CUSTOMER,
    senderId: customer._id,
    senderName: customer.name || 'Customer',
    content,
    clientMessageId,
  });

  // Confirm the customer's own message the moment it is durable. Everything
  // below (classification, retrieval, generation) takes seconds and must not
  // hold up the sender's delivery state.
  if (typeof onCustomerMessage === 'function') {
    try {
      onCustomerMessage(customerMessage);
    } catch (err) {
      logger.warn(`onCustomerMessage callback failed: ${err.message}`);
    }
  }

  const history = await conversationService.getHistory(conversation._id, 12);

  // 2. Classify.
  const classification = await gemini.classifyIntent(content, { history: history.slice(0, -1) });

  // 3. An EXPLICIT request for a person is the only thing in this function
  //    that may move the conversation to a human. Low confidence, missing
  //    knowledge and refusals never do — they offer the customer a button and
  //    leave the conversation in AI mode.
  if (classification.wantsHuman || classification.intent === INTENTS.HUMAN_REQUEST) {
    const handoff = await requestHumanHandoff({
      product,
      conversation,
      customer,
      reason: 'Customer asked to speak with the support team',
      intent: classification.intent,
      priority: classification.priority,
    });
    return {
      type: 'handoff',
      customerMessage: conversationService.serializeMessage(customerMessage),
      ...handoff,
    };
  }

  // 4. Retrieve — product-scoped, chunk-level.
  const { chunks, strategy, embedded } = await rag.retrieve({ productId, question: content });
  const knowledge = rag.buildContext(chunks);

  // 5. Candidate videos for this product only.
  const videos = await training.findRelevantVideos({ productId, question: content, limit: 3 });

  // 6. Verified account data (empty unless a real record says otherwise).
  const verifiedData = await getVerifiedAccountData({ customerId: customer._id, productId });

  // 7. Grounded answer.
  const result = await gemini.generateSupportAnswer({
    product,
    question: content,
    knowledge,
    videos,
    history,
    verifiedData,
    intent: classification.intent,
  });

  // 8. Resolve the attached video against this product's catalogue.
  let video = null;
  if (result.videoId) {
    video = await TrainingVideo.findOne({ _id: result.videoId, productId, active: true })
      .select('title videoUrl thumbnailUrl duration feature description')
      .lean();
    if (video) {
      training.trackRecommendation({
        videoId: video._id,
        productId,
        conversationId: conversation._id,
        customerId: customer._id,
      });
    }
  }

  // 9. Contextual recommendation — suppressed on sensitive/unanswered turns.
  let recommendation = null;
  if (result.answered && !result.escalate) {
    const rec = await marketing.getContextualRecommendation({
      sourceProductId: productId,
      question: content,
      intent: classification.intent,
      sentiment: classification.sentiment,
      answered: result.answered,
      escalated: result.escalate,
    });
    if (rec) {
      recommendation = {
        recommendationId: rec._id,
        title: rec.title,
        description: rec.description,
        ctaText: rec.ctaText,
        ctaUrl: rec.ctaUrl || (rec.promotedProductId?.slug ? `/support/${rec.promotedProductId.slug}` : ''),
      };
      marketing.trackImpression(rec._id, { productId, customerId: customer._id });
    }
  }

  // 10. Persist the AI turn with full provenance.
  const aiMeta = {
    answered: result.answered,
    intent: classification.intent,
    confidence: result.confidence,
    model: result.model,
    steps: result.steps,
    sources: (result.sources || []).map((s) => ({
      knowledgeId: s.id,
      title: s.title,
      category: s.category,
      score: s.score,
    })),
    video: video
      ? {
          videoId: video._id,
          title: video.title,
          videoUrl: video.videoUrl,
          thumbnailUrl: video.thumbnailUrl,
          duration: video.duration,
        }
      : undefined,
    recommendation: recommendation || undefined,
    escalate: result.escalate || !result.answered,
    latencyMs: result.latencyMs || 0,
  };

  const aiMessage = await conversationService.addMessage({
    conversation,
    senderType: SENDER_TYPE.AI,
    senderName: `${product.name} Assistant`,
    content: result.answer,
    messageType: MESSAGE_TYPE.AI_ANSWER,
    ai: aiMeta,
  });

  // 11. Bookkeeping.
  const priorityUp = RANK[classification.priority] > RANK[conversation.priority || PRIORITY.NORMAL];
  await Conversation.updateOne(
    { _id: conversation._id },
    {
      $set: {
        detectedIntent: classification.intent,
        ...(priorityUp ? { priority: classification.priority } : {}),
        ...(conversation.subject ? {} : { subject: content.slice(0, 120) }),
      },
      $addToSet: { intentHistory: classification.intent },
    }
  );

  await Customer.updateOne(
    { _id: customer._id },
    { $inc: { 'stats.aiInteractions': 1 }, $set: { lastContactAt: new Date() } }
  ).catch(() => null);

  if (result.sources?.length) rag.markUsage(result.sources.map((s) => s.id));

  AnalyticsEvent.track({
    type: result.answered ? AnalyticsEvent.EVENTS.AI_ANSWERED : AnalyticsEvent.EVENTS.AI_UNANSWERED,
    productId,
    customerId: customer._id,
    conversationId: conversation._id,
    label: content.slice(0, 200),
    value: result.confidence,
    meta: { intent: classification.intent, scope: result.scope, strategy, embedded, reason: result.reason },
  });

  // Structured trace for debugging a bad answer. Deliberately contains no
  // API keys, no payment details and no verified account values — only the
  // routing decisions and retrieval shape.
  logger.info(
    [
      'AI SUPPORT:',
      `  Product:          ${product.name} (${product.slug})`,
      `  Question:         ${truncate(content, 160)}`,
      `  Intent:           ${classification.intent} (${classification.source})`,
      `  Question type:    ${result.scope || 'informational'}`,
      `  Gemini:           ${gemini.isEnabled() ? `enabled (${gemini.modelName()})` : 'disabled — keyword/extractive'}`,
      `  Retrieval:        ${strategy}${embedded ? ' (semantic)' : ' (lexical)'}`,
      `  Knowledge chunks: ${knowledge.length}`,
      `  Top score:        ${knowledge.length ? Number(knowledge[0].score || 0).toFixed(3) : 'n/a'}`,
      `  Verified data:    ${Object.keys(verifiedData || {}).length ? 'available' : 'none'}`,
      `  Answered:         ${result.answered}`,
      `  Refusal reason:   ${result.answered ? 'n/a' : result.reason}`,
      `  Video attached:   ${video ? video.title : 'none'}`,
      `  Escalation offer: ${aiMeta.escalate}`,
      `  Human requested:  false`,
      `  Channel:          ${conversation.channel}`,
      `  Latency:          ${result.latencyMs}ms`,
    ].join('\n')
  );

  return {
    type: 'answer',
    customerMessage: conversationService.serializeMessage(customerMessage),
    aiMessage: conversationService.serializeMessage(aiMessage),
    answered: result.answered,
    escalate: aiMeta.escalate,
    intent: classification.intent,
    priority: classification.priority,
    video: video || null,
    recommendation,
    sources: aiMeta.sources,
    scope: result.scope,
    // Stays 'ai' unless the customer explicitly asks for a person.
    channel: conversation.channel,
    retrieval: { strategy, embedded, chunks: knowledge.length },
  };
}

/**
 * Moves an existing AI conversation into the human queue. The conversation is
 * never recreated — the agent inherits the whole AI transcript.
 */
async function requestHumanHandoff({ product, conversation, customer, reason = '', intent = '', priority }) {
  const messages = await require('../../models')
    .Message.find({ conversationId: conversation._id, isInternal: false })
    .sort({ createdAt: 1 })
    .lean();

  const summary = await gemini.summarizeConversation({
    messages,
    intent: intent || conversation.detectedIntent,
    customerName: customer.name || customer.email || 'Anonymous visitor',
    productName: product.name,
  });

  const brief = gemini.formatHandoffBrief(summary, {
    customerName: customer.name || customer.email || 'Anonymous visitor',
    productName: product.name,
  });

  const nextPriority =
    RANK[summary.priority] > RANK[priority || conversation.priority || PRIORITY.NORMAL]
      ? summary.priority
      : priority || conversation.priority || PRIORITY.NORMAL;

  const updated = await Conversation.findByIdAndUpdate(
    conversation._id,
    {
      $set: {
        channel: 'human',
        status: conversation.assignedAgentId ? CONVERSATION_STATUS.ACTIVE : CONVERSATION_STATUS.UNASSIGNED,
        handoffRequested: true,
        handoffRequestedAt: new Date(),
        handoffReason: reason || summary.issue,
        aiSummary: summary.summary,
        aiSummaryGeneratedAt: new Date(),
        aiSuggestedTeam: summary.suggestedTeam,
        priority: nextPriority,
        ...(intent ? { detectedIntent: intent } : {}),
      },
    },
    { new: true }
  );

  Object.assign(conversation, updated.toObject());

  // System message that the agent sees inline in the transcript.
  const systemMessage = await conversationService.addMessage({
    conversation,
    senderType: SENDER_TYPE.SYSTEM,
    senderName: 'System',
    content: `Conversation transferred to the support team.\n\n${brief}`,
    messageType: MESSAGE_TYPE.HANDOFF,
    broadcast: false,
  });

  // Customer-facing confirmation.
  const notice = await conversationService.addMessage({
    conversation,
    senderType: SENDER_TYPE.AI,
    senderName: `${product.name} Assistant`,
    content:
      "I've passed this to our support team along with everything we discussed, so you won't need to repeat yourself. Someone will join this chat shortly.",
    messageType: MESSAGE_TYPE.TEXT,
  });

  await Customer.updateOne({ _id: customer._id }, { $inc: { 'stats.escalations': 1 } }).catch(() => null);

  AnalyticsEvent.track({
    type: AnalyticsEvent.EVENTS.ESCALATION,
    productId: product._id,
    customerId: customer._id,
    conversationId: conversation._id,
    label: summary.issue,
    meta: { team: summary.suggestedTeam, intent: intent || conversation.detectedIntent },
  });

  // Ring the inbox.
  const lite = conversationService.serializeConversationLite(conversation);
  emitter.toAgents('conversation:handoff', {
    conversation: lite,
    summary,
    product: { _id: String(product._id), name: product.name, slug: product.slug },
    customer: {
      _id: String(customer._id),
      name: customer.name || '',
      email: customer.email || '',
    },
  });
  emitter.toAgents('conversation:new', lite);

  return {
    conversation: lite,
    summary,
    brief,
    systemMessage: conversationService.serializeMessage(systemMessage),
    noticeMessage: conversationService.serializeMessage(notice),
  };
}

/** Support-homepage bootstrap payload: announcements, videos, popular help. */
async function getProductSupportContext(product) {
  const { Announcement, KnowledgeItem } = require('../../models');
  const [announcements, videos, popular, recommendations] = await Promise.all([
    Announcement.find(Announcement.liveFilter(product._id))
      .sort({ priority: -1, startAt: -1 })
      .limit(5)
      .lean(),
    TrainingVideo.find({ productId: product._id, active: true })
      .select('title description feature category videoUrl thumbnailUrl duration')
      .sort({ sortOrder: 1 })
      .limit(6)
      .lean(),
    KnowledgeItem.find({ productId: product._id, active: true, status: 'published' })
      .select('title category summary content')
      .sort({ usageCount: -1, updatedAt: -1 })
      .limit(8)
      .lean(),
    marketing.getPlacementRecommendations({ placement: 'support_homepage', sourceProductId: product._id, limit: 3 }),
  ]);

  return { announcements, videos, popular, recommendations };
}

/** Resolves a support slug to an active product. */
async function findProductBySlug(slug) {
  return Product.findOne({ slug: String(slug || '').toLowerCase(), active: true });
}

module.exports = {
  handleCustomerMessage,
  requestHumanHandoff,
  getProductSupportContext,
  findProductBySlug,
};
