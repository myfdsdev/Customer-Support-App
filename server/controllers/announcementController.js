'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Announcement, CustomerProduct, Customer, Notification } = require('../models');
const { ANNOUNCEMENT_TYPES, NOTIFICATION_TYPES, PURCHASE_STATUS } = require('../utils/constants');
const { sanitizeText, sanitizeUrl } = require('../utils/sanitize');

/**
 * Raises a bell notification for every customer eligible to see a portal
 * announcement: owners of the product when it is product-specific and
 * ownersOnly, or every customer with a portal account otherwise. Bounded and
 * fire-and-forget — a slow notification fan-out must never fail the save.
 */
async function dispatchAnnouncementNotifications(announcement) {
  if (!announcement.showInPortal || !announcement.notifyCustomers) return;
  if (announcement.notificationsSentAt) return; // already sent once

  let customerIds;
  if (announcement.productId && announcement.ownersOnly) {
    const ents = await CustomerProduct.find({
      productId: announcement.productId,
      verified: true,
      purchaseStatus: PURCHASE_STATUS.ACTIVE,
    })
      .select('customerId')
      .limit(50000)
      .lean();
    customerIds = [...new Set(ents.map((e) => String(e.customerId)))];
  } else {
    const customers = await Customer.find({ hasPortalAccount: true }).select('_id').limit(50000).lean();
    customerIds = customers.map((c) => String(c._id));
  }

  const type =
    announcement.type === 'Product Update'
      ? NOTIFICATION_TYPES.PRODUCT_UPDATE
      : NOTIFICATION_TYPES.ANNOUNCEMENT;

  await Promise.all(
    customerIds.map((customerId) =>
      Notification.push({
        customerId,
        type,
        title: announcement.title,
        body: sanitizeText(announcement.content || '', 300),
        link: '/portal/dashboard',
        productId: announcement.productId || null,
        refId: announcement._id,
      })
    )
  ).catch(() => null);

  announcement.notificationsSentAt = new Date();
  await announcement.save().catch(() => null);
}

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
    title: sanitizeText(title, 200),
    content: sanitizeText(content || '', 8000),
    type: ANNOUNCEMENT_TYPES.includes(type) ? type : 'General Announcement',
    productId: productId || null,
    priority: priority || 'normal',
    startAt: startAt || new Date(),
    endAt: endAt || null,
    active: active !== undefined ? Boolean(active) : true,
    linkUrl: sanitizeUrl(linkUrl || ''),
    linkText: sanitizeText(linkText || '', 60),
    createdBy: req.user._id,
    // Portal fields.
    showInPortal: req.body.showInPortal !== undefined ? Boolean(req.body.showInPortal) : false,
    imageUrl: sanitizeUrl(req.body.imageUrl || ''),
    ownersOnly: Boolean(req.body.ownersOnly),
    notifyCustomers: Boolean(req.body.notifyCustomers),
    displayOrder: Number(req.body.displayOrder) || 0,
  });

  await dispatchAnnouncementNotifications(announcement);

  res.status(201).json({ success: true, data: announcement });
});

/** PATCH /api/announcements/:id */
const updateAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findById(req.params.id);
  if (!announcement) throw ApiError.notFound('Announcement not found');

  if (req.body.title !== undefined) announcement.title = sanitizeText(req.body.title, 200);
  if (req.body.content !== undefined) announcement.content = sanitizeText(req.body.content, 8000);
  if (req.body.priority !== undefined) announcement.priority = req.body.priority;
  if (req.body.linkUrl !== undefined) announcement.linkUrl = sanitizeUrl(req.body.linkUrl);
  if (req.body.linkText !== undefined) announcement.linkText = sanitizeText(req.body.linkText, 60);
  if (req.body.type !== undefined && ANNOUNCEMENT_TYPES.includes(req.body.type)) announcement.type = req.body.type;
  if (req.body.productId !== undefined) announcement.productId = req.body.productId || null;
  if (req.body.startAt !== undefined) announcement.startAt = req.body.startAt;
  if (req.body.endAt !== undefined) announcement.endAt = req.body.endAt || null;
  if (req.body.active !== undefined) announcement.active = Boolean(req.body.active);
  if (req.body.showInPortal !== undefined) announcement.showInPortal = Boolean(req.body.showInPortal);
  if (req.body.imageUrl !== undefined) announcement.imageUrl = sanitizeUrl(req.body.imageUrl);
  if (req.body.ownersOnly !== undefined) announcement.ownersOnly = Boolean(req.body.ownersOnly);
  if (req.body.notifyCustomers !== undefined) announcement.notifyCustomers = Boolean(req.body.notifyCustomers);
  if (req.body.displayOrder !== undefined) announcement.displayOrder = Number(req.body.displayOrder) || 0;

  await announcement.save();

  // Publishing (active + showInPortal + notify) fans out notifications once.
  if (announcement.active && announcement.showInPortal && announcement.notifyCustomers) {
    await dispatchAnnouncementNotifications(announcement);
  }

  res.json({ success: true, data: announcement });
});

/** DELETE /api/announcements/:id */
const deleteAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findByIdAndDelete(req.params.id);
  if (!announcement) throw ApiError.notFound('Announcement not found');
  res.json({ success: true, message: 'Announcement deleted' });
});

module.exports = { listAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement };
