'use strict';

const mongoose = require('mongoose');
const { SENDER_TYPE_LIST, MESSAGE_TYPE, MESSAGE_TYPE_LIST } = require('../utils/constants');

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },

    senderType: { type: String, enum: SENDER_TYPE_LIST, required: true },
    /** User id for agents, Customer id for customers, null for ai/system. */
    senderId: { type: mongoose.Schema.Types.ObjectId, default: null },
    senderName: { type: String, default: '' },

    /**
     * Sender-generated id, echoed back so the client can swap its optimistic
     * bubble for the saved document. Also the idempotency key: a socket retry,
     * a reconnect replay or a double-click cannot create a second message.
     */
    clientMessageId: { type: String, default: null },

    content: { type: String, default: '', maxlength: 20000 },
    messageType: { type: String, enum: MESSAGE_TYPE_LIST, default: MESSAGE_TYPE.TEXT },

    attachmentUrl: { type: String, default: '' },
    attachmentName: { type: String, default: '' },
    attachmentType: { type: String, default: '' },
    attachmentSize: { type: Number, default: 0 },

    /** Internal notes are visible to staff only and never sent to the customer. */
    isInternal: { type: Boolean, default: false, index: true },

    /**
     * AI provenance. `sources` are the knowledge items actually used, so an
     * agent can audit exactly what the answer was grounded in.
     */
    ai: {
      answered: { type: Boolean, default: null },
      intent: { type: String, default: '' },
      confidence: { type: Number, default: null },
      model: { type: String, default: '' },
      steps: { type: [String], default: [] },
      sources: {
        type: [
          {
            _id: false,
            knowledgeId: { type: mongoose.Schema.Types.ObjectId, ref: 'KnowledgeItem' },
            title: String,
            category: String,
            score: Number,
          },
        ],
        default: [],
      },
      video: {
        videoId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrainingVideo', default: null },
        title: { type: String, default: '' },
        videoUrl: { type: String, default: '' },
        thumbnailUrl: { type: String, default: '' },
        duration: { type: Number, default: 0 },
      },
      recommendation: {
        recommendationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recommendation', default: null },
        title: { type: String, default: '' },
        description: { type: String, default: '' },
        ctaText: { type: String, default: '' },
        ctaUrl: { type: String, default: '' },
      },
      escalate: { type: Boolean, default: false },
      latencyMs: { type: Number, default: 0 },
    },

    readAt: { type: Date, default: null },
    readBy: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    deliveredAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

messageSchema.index({ conversationId: 1, createdAt: 1 });

// Enforces idempotency in the database rather than in application logic, so
// two concurrent sends of the same clientMessageId cannot both win the race.
// Partial (not just sparse) so the many null clientMessageIds on AI, system
// and legacy messages are excluded from the unique constraint entirely.
messageSchema.index(
  { conversationId: 1, clientMessageId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientMessageId: { $type: 'string' } },
    name: 'conversation_client_message_idempotency',
  }
);

module.exports = mongoose.model('Message', messageSchema);
