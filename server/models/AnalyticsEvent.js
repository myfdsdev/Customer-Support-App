'use strict';

const mongoose = require('mongoose');

/**
 * Append-only event log powering the analytics screens. Kept generic so new
 * event types do not need a migration.
 */
const analyticsEventSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null, index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', default: null },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    refId: { type: mongoose.Schema.Types.ObjectId, default: null },
    label: { type: String, default: '' },
    value: { type: Number, default: 0 },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

analyticsEventSchema.index({ type: 1, createdAt: -1 });
analyticsEventSchema.index({ productId: 1, type: 1, createdAt: -1 });

const EVENTS = {
  AI_ANSWERED: 'ai_answered',
  AI_UNANSWERED: 'ai_unanswered',
  AI_RESOLVED: 'ai_resolved',
  HUMAN_RESOLVED: 'human_resolved',
  ESCALATION: 'escalation',
  CONVERSATION_STARTED: 'conversation_started',
  TICKET_CREATED: 'ticket_created',
  VIDEO_RECOMMENDED: 'video_recommended',
  VIDEO_CLICKED: 'video_clicked',
  RECOMMENDATION_IMPRESSION: 'recommendation_impression',
  RECOMMENDATION_CLICK: 'recommendation_click',
  KNOWLEDGE_VIEWED: 'knowledge_viewed',
};

/** Fire-and-forget: analytics must never break a support interaction. */
analyticsEventSchema.statics.track = function track(payload) {
  return this.create(payload).catch(() => null);
};

const AnalyticsEvent = mongoose.model('AnalyticsEvent', analyticsEventSchema);
AnalyticsEvent.EVENTS = EVENTS;

module.exports = AnalyticsEvent;
