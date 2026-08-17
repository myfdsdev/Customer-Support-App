'use strict';

const mongoose = require('mongoose');
const { NOTIFICATION_TYPE_LIST, NOTIFICATION_TYPES } = require('../utils/constants');

/**
 * A customer-facing notification. Real rows in the database rather than
 * transient client state, so an unread badge survives a refresh, a new device
 * and a re-login.
 */
const notificationSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPE_LIST, required: true, index: true },

    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, default: '', maxlength: 1000 },

    /** In-app destination, e.g. /portal/products/my-app. Always a local path. */
    link: { type: String, default: '' },

    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', default: null },
    /** Announcement / recommendation / whatever the type implies. */
    refId: { type: mongoose.Schema.Types.ObjectId, default: null },

    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The two queries the portal actually runs: the unread badge, and the list.
notificationSchema.index({ customerId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ customerId: 1, createdAt: -1 });
/**
 * Stops a repeated event (an agent sending five replies in a row, a webhook
 * retry) from stacking five identical rows. Only applies where refId is set;
 * notifications without one are always distinct.
 */
notificationSchema.index(
  { customerId: 1, type: 1, refId: 1 },
  { unique: true, partialFilterExpression: { refId: { $type: 'objectId' } }, name: 'notification_dedupe' }
);

/**
 * Fire-and-forget create that swallows duplicate-key errors.
 * A notification must never be the reason a support message fails to send.
 */
notificationSchema.statics.push = function push(payload) {
  if (!payload || !payload.customerId) return Promise.resolve(null);
  return this.create(payload).catch((err) => {
    if (err && err.code === 11000) return null; // already notified
    return null;
  });
};

const Notification = mongoose.model('Notification', notificationSchema);
Notification.TYPES = NOTIFICATION_TYPES;

module.exports = Notification;
