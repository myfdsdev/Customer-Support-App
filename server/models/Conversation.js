'use strict';

const mongoose = require('mongoose');
const {
  CONVERSATION_STATUS,
  CONVERSATION_STATUS_LIST,
  PRIORITY,
  PRIORITY_LIST,
  INTENT_LIST,
} = require('../utils/constants');

const conversationSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerSession', default: null },
    assignedAgentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    subject: { type: String, default: '', maxlength: 200 },
    status: {
      type: String,
      enum: CONVERSATION_STATUS_LIST,
      default: CONVERSATION_STATUS.NEW,
      index: true,
    },
    priority: { type: String, enum: PRIORITY_LIST, default: PRIORITY.NORMAL, index: true },

    /** 'ai' until the customer asks for a person; 'human' afterwards. */
    channel: { type: String, enum: ['ai', 'human'], default: 'ai', index: true },

    detectedIntent: { type: String, enum: [...INTENT_LIST, ''], default: '' },
    intentHistory: { type: [String], default: [] },

    aiSummary: { type: String, default: '' },
    aiSummaryGeneratedAt: { type: Date, default: null },
    aiSuggestedTeam: { type: String, default: '' },
    aiResolved: { type: Boolean, default: false },

    handoffRequested: { type: Boolean, default: false, index: true },
    handoffRequestedAt: { type: Date, default: null },
    handoffReason: { type: String, default: '' },

    tags: { type: [String], default: [] },

    lastMessageAt: { type: Date, default: Date.now, index: true },
    lastMessagePreview: { type: String, default: '' },
    lastMessageSender: { type: String, default: '' },

    unreadForAgent: { type: Number, default: 0 },
    unreadForCustomer: { type: Number, default: 0 },

    messageCount: { type: Number, default: 0 },
    aiMessageCount: { type: Number, default: 0 },
    agentMessageCount: { type: Number, default: 0 },

    /** Timestamps used by the response/resolution time analytics. */
    firstCustomerMessageAt: { type: Date, default: null },
    firstAgentReplyAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedByType: { type: String, enum: ['ai', 'agent', 'customer', ''], default: '' },
    closedAt: { type: Date, default: null },
    reopenedCount: { type: Number, default: 0 },

    ratings: {
      helpful: { type: Boolean, default: null },
      ratedAt: { type: Date, default: null },
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

conversationSchema.index({ productId: 1, status: 1, lastMessageAt: -1 });
conversationSchema.index({ assignedAgentId: 1, status: 1, lastMessageAt: -1 });
conversationSchema.index({ customerId: 1, createdAt: -1 });

conversationSchema.virtual('isOpen').get(function isOpen() {
  return ![CONVERSATION_STATUS.RESOLVED, CONVERSATION_STATUS.CLOSED].includes(this.status);
});

module.exports = mongoose.model('Conversation', conversationSchema);
