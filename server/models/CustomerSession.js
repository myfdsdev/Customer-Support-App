'use strict';

const mongoose = require('mongoose');
const { PRESENCE } = require('../utils/constants');

const customerSessionSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
    anonymousId: { type: String, required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },

    presenceStatus: { type: String, enum: Object.values(PRESENCE), default: PRESENCE.ONLINE, index: true },
    currentPage: { type: String, default: '' },
    currentConversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', default: null },

    socketIds: { type: [String], default: [] },
    userAgent: { type: String, default: '' },
    ipHash: { type: String, default: '' },
    referrer: { type: String, default: '' },

    startedAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now, index: true },
    endedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

customerSessionSchema.index({ productId: 1, presenceStatus: 1, lastSeenAt: -1 });

/** Seconds the visitor has had the support page open. */
customerSessionSchema.virtual('durationSeconds').get(function durationSeconds() {
  const end = this.endedAt || this.lastSeenAt || new Date();
  return Math.max(0, Math.round((end - this.startedAt) / 1000));
});

/**
 * Presence is informational, so it is derived from recency rather than trusted
 * blindly: a socket can die without a disconnect event ever arriving.
 */
customerSessionSchema.methods.effectivePresence = function effectivePresence() {
  if (this.endedAt) return PRESENCE.OFFLINE;
  const idleMs = Date.now() - new Date(this.lastSeenAt).getTime();
  if (idleMs < 60 * 1000) return this.presenceStatus === PRESENCE.AWAY ? PRESENCE.AWAY : PRESENCE.ONLINE;
  if (idleMs < 5 * 60 * 1000) return PRESENCE.AWAY;
  return PRESENCE.OFFLINE;
};

module.exports = mongoose.model('CustomerSession', customerSessionSchema);
