'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { Recommendation, Announcement, Product } = require('../models');
const {
  PORTAL_PLACEMENTS,
  RECOMMENDATION_BADGES,
  ANNOUNCEMENT_TYPES,
} = require('../utils/constants');

/**
 * Read model for the admin "Portal content" screen.
 *
 * The mutations reuse the existing recommendation/announcement controllers
 * (now capability-gated) so there is exactly one write path per model — no
 * duplicate CRUD. This endpoint just assembles what that screen needs to
 * render: the portal-placement cards, the portal announcements, and the
 * option lists.
 */
const getPortalContentOverview = asyncHandler(async (_req, res) => {
  const [cards, announcements, products] = await Promise.all([
    Recommendation.find({ placement: { $in: PORTAL_PLACEMENTS } })
      .populate('promotedProductId', 'name slug logo')
      .sort({ placement: 1, displayOrder: 1, createdAt: -1 })
      .lean(),
    Announcement.find({ showInPortal: true })
      .populate('productId', 'name slug')
      .sort({ displayOrder: 1, startAt: -1 })
      .lean(),
    Product.find({ active: true }).select('name slug logo dashboardVisibility featured sortOrder').sort({ sortOrder: 1, name: 1 }).lean(),
  ]);

  res.json({
    success: true,
    data: {
      cards,
      announcements,
      products,
      meta: {
        placements: PORTAL_PLACEMENTS,
        badges: RECOMMENDATION_BADGES,
        announcementTypes: ANNOUNCEMENT_TYPES,
      },
    },
  });
});

module.exports = { getPortalContentOverview };
