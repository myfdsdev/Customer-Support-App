'use strict';

const mongoose = require('mongoose');
const { ANNOUNCEMENT_TYPES, PRIORITY, PRIORITY_LIST } = require('../utils/constants');

const announcementSchema = new mongoose.Schema(
  {
    /** null = shown on every product support page. */
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null, index: true },

    type: { type: String, enum: ANNOUNCEMENT_TYPES, default: 'General Announcement', index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    content: { type: String, default: '', maxlength: 8000 },
    priority: { type: String, enum: PRIORITY_LIST, default: PRIORITY.NORMAL },

    linkUrl: { type: String, default: '' },
    linkText: { type: String, default: '' },

    startAt: { type: Date, default: Date.now, index: true },
    endAt: { type: Date, default: null, index: true },
    active: { type: Boolean, default: true, index: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    viewCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

announcementSchema.index({ productId: 1, active: 1, startAt: -1 });

/** Query fragment for "currently live" announcements. */
announcementSchema.statics.liveFilter = function liveFilter(productId) {
  const now = new Date();
  return {
    active: true,
    startAt: { $lte: now },
    $and: [
      { $or: [{ endAt: null }, { endAt: { $gte: now } }] },
      { $or: [{ productId }, { productId: null }] },
    ],
  };
};

module.exports = mongoose.model('Announcement', announcementSchema);
