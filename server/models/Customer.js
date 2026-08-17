'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
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

    /* -------------------------------------------------------------------
     * Membership-portal credentials.
     *
     * Every field here is optional. A Customer created by the support widget
     * or by a CSV import has none of them and stays a perfectly valid CRM
     * record — it simply cannot log in until someone registers on that email.
     * ---------------------------------------------------------------- */

    /** bcrypt hash. `select: false` so it can never leak through a find(). */
    passwordHash: { type: String, default: null, select: false },
    /** True once a password has been set — safe to expose, unlike the hash. */
    hasPortalAccount: { type: Boolean, default: false, index: true },

    emailVerified: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date, default: null },
    emailVerificationTokenHash: { type: String, default: null, select: false },
    emailVerificationExpiresAt: { type: Date, default: null, select: false },

    passwordResetTokenHash: { type: String, default: null, select: false },
    passwordResetExpiresAt: { type: Date, default: null, select: false },

    lastLoginAt: { type: Date, default: null },
    /**
     * Bumped on password change / reset. Portal tokens embed the value they
     * were minted with, so raising it invalidates every token already issued
     * without needing a server-side session store.
     */
    sessionVersion: { type: Number, default: 0 },

    /** Failed-login throttling, per account (the IP limiter is separate). */
    failedLoginCount: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, default: null, select: false },

    /** Powers "Continue where you left off" on the portal dashboard. */
    lastOpenedProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    lastOpenedProductAt: { type: Date, default: null },

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

/**
 * Unique email, but only for customers that actually have one.
 *
 * This must be a PARTIAL index, not a sparse one. `email` is declared with
 * `default: null`, so the field is always present in the document — a sparse
 * index therefore indexes every anonymous customer as `null` and the second
 * anonymous visitor collides with the first. Filtering on `$type: 'string'`
 * excludes nulls properly.
 */
customerSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } }, name: 'customer_email_unique' }
);
customerSchema.index({ name: 'text', email: 'text', phone: 'text' });
// Reset/verification lookups are equality matches on the hash, so they need
// their own index — without it every reset link is a collection scan.
customerSchema.index(
  { passwordResetTokenHash: 1 },
  { sparse: true, name: 'customer_password_reset_token' }
);
customerSchema.index(
  { emailVerificationTokenHash: 1 },
  { sparse: true, name: 'customer_email_verification_token' }
);

customerSchema.virtual('displayName').get(function displayName() {
  return this.name || this.email || 'Anonymous visitor';
});

customerSchema.virtual('firstName').get(function firstName() {
  const source = (this.name || '').trim();
  if (source) return source.split(/\s+/)[0];
  return (this.email || '').split('@')[0] || 'there';
});

/**
 * The one place a portal password is written. Setting it also marks the record
 * as having a portal account, so the boolean and the hash can never disagree.
 */
customerSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(String(plain), 12);
  this.hasPortalAccount = true;
  this.sessionVersion = (this.sessionVersion || 0) + 1;
  this.failedLoginCount = 0;
  this.lockedUntil = null;
};

/**
 * Constant-time-ish password check.
 *
 * Returns false rather than throwing when no hash is loaded, so a caller that
 * forgot `.select('+passwordHash')` fails closed instead of crashing.
 */
customerSchema.methods.verifyPassword = function verifyPassword(plain) {
  if (!this.passwordHash) return Promise.resolve(false);
  return bcrypt.compare(String(plain), this.passwordHash);
};

/** Everything the portal is allowed to see about itself. Never the hashes. */
customerSchema.methods.toPortalJSON = function toPortalJSON() {
  return {
    _id: String(this._id),
    name: this.name || '',
    firstName: this.firstName,
    email: this.email || '',
    phone: this.phone || '',
    status: this.status,
    emailVerified: Boolean(this.emailVerified),
    timezone: this.timezone || '',
    lastLoginAt: this.lastLoginAt || null,
    createdAt: this.createdAt,
  };
};

/** Lowercase + trim. The single definition of "the same email". */
customerSchema.statics.normalizeEmail = function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
};

module.exports = mongoose.model('Customer', customerSchema);
