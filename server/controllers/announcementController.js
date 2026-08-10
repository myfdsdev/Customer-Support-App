'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Announcement } = require('../models');
const { ANNOUNCEMENT_TYPES } = require('../utils/constants');

/** GET /api/announcements */
const listAnnouncements = asyncHandler(async (req, res) => {
  const { productId, type, active } = req.query;
  const filter = {};
  if (productId) filter.productId = productId === 'global' ? null : productId;
  if (type) filter.type = type;
  if (active !== undefined && active !== '') filter.active = active === 'true';

  const announcements = await Announcement.find(filter)
    .populate('productId', 'name slug')
    .sort({ startAt: -1 })
    .lean();

  res.json({ success: true, data: announcements, meta: { types: ANNOUNCEMENT_TYPES } });
});

/** POST /api/announcements */
const createAnnouncement = asyncHandler(async (req, res) => {
  const { title, content, type, productId, priority, startAt, endAt, active, linkUrl, linkText } = req.body;
  if (!title) throw ApiError.badRequest('Title is required');

  const announcement = await Announcement.create({
    title,
    content: content || '',
    type: ANNOUNCEMENT_TYPES.includes(type) ? type : 'General Announcement',
    productId: productId || null,
    priority: priority || 'normal',
    startAt: startAt || new Date(),
    endAt: endAt || null,
    active: active !== undefined ? Boolean(active) : true,
    linkUrl: linkUrl || '',
    linkText: linkText || '',
    createdBy: req.user._id,
  });

  res.status(201).json({ success: true, data: announcement });
});

/** PATCH /api/announcements/:id */
const updateAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findById(req.params.id);
  if (!announcement) throw ApiError.notFound('Announcement not found');

  ['title', 'content', 'priority', 'linkUrl', 'linkText'].forEach((f) => {
    if (req.body[f] !== undefined) announcement[f] = req.body[f];
  });
  if (req.body.type !== undefined && ANNOUNCEMENT_TYPES.includes(req.body.type)) announcement.type = req.body.type;
  if (req.body.productId !== undefined) announcement.productId = req.body.productId || null;
  if (req.body.startAt !== undefined) announcement.startAt = req.body.startAt;
  if (req.body.endAt !== undefined) announcement.endAt = req.body.endAt || null;
  if (req.body.active !== undefined) announcement.active = Boolean(req.body.active);

  await announcement.save();
  res.json({ success: true, data: announcement });
});

/** DELETE /api/announcements/:id */
const deleteAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findByIdAndDelete(req.params.id);
  if (!announcement) throw ApiError.notFound('Announcement not found');
  res.json({ success: true, message: 'Announcement deleted' });
});

module.exports = { listAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement };
