'use strict';

const mongoose = require('mongoose');
const { PRESENCE } = require('../utils/constants');

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, default: '', trim: true, maxlength: 120 },
    email: { type: String, default: null, lowercase: true, trim: true },
    phone: { type: String, default: '', trim: true, maxlength: 40 },
    status: { type: String, enum: ['lead', 'active', 'churned', 'blocked'], default: 'active', index: true },

    /** Browser ids this person has been seen under (anonymous before identifying). */
    anonymousIds: { type: [String], default: [], index: true },

    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now, index: true },
    lastContactAt: { type: Date, default: null },

    presenceStatus: { type: String, enum: Object.values(PRESENCE), default: PRESENCE.OFFLINE, index: true },

    tags: { type: [String], default: [], index: true },
    country: { type: String, default: '' },
    timezone: { type: String, default: '' },

    /** Denormalised counters so the CRM list does not need per-row aggregation. */
    stats: {
      conversations: { type: Number, default: 0 },
      tickets: { type: Number, default: 0 },
      aiInteractions: { type: Number, default: 0 },
      humanInteractions: { type: Number, default: 0 },
      escalations: { type: Number, default: 0 },
    },
    issueCategories: { type: [String], default: [] },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Sparse unique: many anonymous customers legitimately have no email.
customerSchema.index({ email: 1 }, { unique: true, sparse: true });
customerSchema.index({ name: 'text', email: 'text', phone: 'text' });

customerSchema.virtual('displayName').get(function displayName() {
  return this.name || this.email || 'Anonymous visitor';
});

module.exports = mongoose.model('Customer', customerSchema);
