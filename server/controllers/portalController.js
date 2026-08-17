'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { signSupportToken, signLaunchToken } = require('../utils/tokens');
const {
  Customer,
  Product,
  CustomerProduct,
  Conversation,
  Announcement,
  Notification,
  AnalyticsEvent,
} = require('../models');
const presence = require('../services/support/presenceService');
const marketing = require('../services/marketing');
const emitter = require('../services/socket/emitter');
const {
  PURCHASE_STATUS,
  DASHBOARD_VISIBILITY,
  ACCESS_MODES,
  OPEN_STATUSES,
  PAGE_STATUS,
  ISSUE_CATEGORIES,
} = require('../utils/constants');
const { truncate } = require('../utils/text');

/**
 * The membership portal's read/action API. Everything here is scoped to
 * `req.customer` (set by authenticateCustomer) and never trusts a customer id
 * or product-ownership claim from the request body.
 */

/** Shapes a product for a dashboard/list card. Owned-safe fields only. */
function productCard(product, entitlement) {
  return {
    _id: String(product._id),
    name: product.name,
    slug: product.slug,
    logo: product.logo || '',
    tagline: product.tagline || '',
    brandColor: product.brandColor || '',
    cardImage: product.cardImage || '',
    shortDescription: product.cardDescription || product.tagline || truncate(product.description, 120),
    featured: Boolean(product.featured),
    canLaunch: Boolean(product.launchUrl) && product.accessMode !== ACCESS_MODES.NONE,
    purchase: entitlement
      ? {
          status: entitlement.purchaseStatus,
          plan: entitlement.plan || '',
          purchaseDate: entitlement.purchaseDate || null,
        }
      : null,
    productUrl: `/portal/products/${product.slug}`,
  };
}

/** The customer's active, verified entitlements joined to their products. */
async function loadOwnedProducts(customerId) {
  const entitlements = await CustomerProduct.find({
    customerId,
    verified: true,
    purchaseStatus: PURCHASE_STATUS.ACTIVE,
  }).lean();

  if (!entitlements.length) return { products: [], byProductId: new Map(), ownedIds: new Set() };

  const productIds = entitlements.map((e) => e.productId);
  const products = await Product.find({ _id: { $in: productIds }, active: true })
    .sort({ sortOrder: 1, name: 1 })
    .lean();

  const entByProduct = new Map(entitlements.map((e) => [String(e.productId), e]));
  const ownedIds = new Set(products.map((p) => String(p._id)));
  return { products, byProductId: entByProduct, ownedIds, entitlements };
}

/* -------------------------------------------------------------------------
 * GET /api/portal/dashboard
 * ---------------------------------------------------------------------- */
const getDashboard = asyncHandler(async (req, res) => {
  const customer = req.customer;
  const { products, byProductId, ownedIds } = await loadOwnedProducts(customer._id);

  const purchasedProducts = products.map((p) => productCard(new Product(p), byProductId.get(String(p._id))));

  // Continue where you left off — the last product the customer opened, if
  // they still own it, else the first purchased product.
  let continueUsing = null;
  if (customer.lastOpenedProductId && ownedIds.has(String(customer.lastOpenedProductId))) {
    continueUsing = purchasedProducts.find((p) => p._id === String(customer.lastOpenedProductId)) || null;
  }
  if (!continueUsing) continueUsing = purchasedProducts[0] || null;

  // Discovery products (dashboardVisibility=everyone) the customer does NOT own.
  const discoveryProducts = await Product.find({
    active: true,
    dashboardVisibility: DASHBOARD_VISIBILITY.EVERYONE,
    _id: { $nin: [...ownedIds].map((id) => id) },
  })
    .sort({ sortOrder: 1, name: 1 })
    .limit(6)
    .lean();

  // What's New — portal announcements the customer is eligible to see.
  const announcements = await loadPortalAnnouncements(ownedIds);

  // Recommendations, gated by ownership/segment.
  const recommendations = await marketing.getPortalRecommendations({
    placement: 'customer_dashboard_recommended',
    ownedProductIds: ownedIds,
    customerTags: customer.tags || [],
    limit: 4,
  });
  recommendations.forEach((r) => marketing.trackImpression(r._id, { customerId: customer._id }));

  const featuredCards = await marketing.getPortalRecommendations({
    placement: 'customer_dashboard_featured',
    ownedProductIds: ownedIds,
    customerTags: customer.tags || [],
    limit: 2,
  });

  const [unreadNotifications, openConversations] = await Promise.all([
    Notification.countDocuments({ customerId: customer._id, readAt: null }),
    Conversation.countDocuments({ customerId: customer._id, status: { $in: OPEN_STATUSES } }),
  ]);

  res.json({
    success: true,
    data: {
      customer: customer.toPortalJSON(),
      continueUsing,
      purchasedProducts,
      discoveryProducts: discoveryProducts.map((p) => ({
        ...productCard(new Product(p), null),
        purchaseUrl: p.purchaseUrl || '',
        discovery: true,
      })),
      dashboardCards: featuredCards.map(serializeRecommendation),
      announcements,
      productUpdates: announcements.filter((a) => a.type === 'Product Update'),
      recommendations: recommendations.map(serializeRecommendation),
      unreadNotifications,
      supportSummary: { openConversations },
    },
  });
});

async function loadPortalAnnouncements(ownedIds) {
  const now = new Date();
  const rows = await Announcement.find({
    active: true,
    showInPortal: true,
    startAt: { $lte: now },
    $or: [{ endAt: null }, { endAt: { $gte: now } }],
  })
    .sort({ displayOrder: 1, startAt: -1 })
    .limit(20)
    .populate('productId', 'name slug logo')
    .lean();

  return rows
    .filter((a) => {
      // Product-specific announcement: only its owners (when ownersOnly), and
      // global announcements (productId null) go to everyone.
      if (!a.productId) return true;
      if (a.ownersOnly) return ownedIds.has(String(a.productId._id || a.productId));
      return true;
    })
    .map((a) => ({
      _id: String(a._id),
      type: a.type,
      title: a.title,
      content: a.content,
      imageUrl: a.imageUrl || '',
      linkUrl: a.linkUrl || '',
      linkText: a.linkText || '',
      product: a.productId ? { name: a.productId.name, slug: a.productId.slug, logo: a.productId.logo } : null,
      startAt: a.startAt,
    }));
}

function serializeRecommendation(r) {
  const promoted = r.promotedProductId || {};
  return {
    _id: String(r._id),
    badge: r.badge || 'Recommended',
    title: r.title,
    description: r.description || '',
    imageUrl: r.imageUrl || promoted.cardImage || '',
    ctaText: r.ctaText || 'Learn more',
    // Prefer an internal destination so the customer stays inside the portal.
    href: r.internalDestination || (promoted.slug ? `/portal/products/${promoted.slug}` : r.ctaUrl || ''),
    external: !r.internalDestination && Boolean(r.ctaUrl) && !promoted.slug,
    product: promoted.slug ? { name: promoted.name, slug: promoted.slug, logo: promoted.logo } : null,
  };
}

/* -------------------------------------------------------------------------
 * GET /api/portal/products  — the "My Products" grid
 * ---------------------------------------------------------------------- */
const listProducts = asyncHandler(async (req, res) => {
  const { products, byProductId } = await loadOwnedProducts(req.customer._id);
  res.json({
    success: true,
    data: products.map((p) => productCard(new Product(p), byProductId.get(String(p._id)))),
  });
});

/* -------------------------------------------------------------------------
 * GET /api/portal/products/:productSlug — internal product detail page
 * Access is enforced by requireCustomerProductAccess (allowDiscovery).
 * ---------------------------------------------------------------------- */
const getProductPage = asyncHandler(async (req, res) => {
  const product = req.product;
  const owns = req.accessMode === 'owner';
  const page = product.portalPage || {};

  // Draft pages are only visible to an owner (so admins can preview via a real
  // owned account); discovery visitors never see a draft.
  if (page.pageStatus === PAGE_STATUS.DRAFT && !owns) {
    throw ApiError.notFound('Product page not found');
  }

  // Remember what the customer last opened (powers "Continue where you left off").
  if (owns) {
    Customer.updateOne(
      { _id: req.customer._id },
      { $set: { lastOpenedProductId: product._id, lastOpenedProductAt: new Date() } }
    ).catch(() => null);
    AnalyticsEvent.track({
      type: AnalyticsEvent.EVENTS.KNOWLEDGE_VIEWED,
      productId: product._id,
      customerId: req.customer._id,
      label: `portal_product_view:${product.slug}`,
    });
  }

  // Related recommendations (product_page_related), gated by ownership.
  let related = [];
  if (page.showRelated !== false) {
    const { ownedIds } = await loadOwnedProducts(req.customer._id);
    const recs = await marketing.getPortalRecommendations({
      placement: 'product_page_related',
      ownedProductIds: ownedIds,
      customerTags: req.customer.tags || [],
      limit: 3,
    });
    related = recs.map(serializeRecommendation);
  }

  res.json({
    success: true,
    data: {
      access: req.accessMode, // 'owner' | 'discovery'
      canLaunch: owns && Boolean(product.launchUrl) && product.accessMode !== ACCESS_MODES.NONE,
      product: {
        _id: String(product._id),
        name: product.name,
        slug: product.slug,
        logo: product.logo || '',
        tagline: product.tagline || '',
        brandColor: product.brandColor || '',
        description: product.description || '',
        purchaseUrl: owns ? '' : product.purchaseUrl || '',
        sections: product.resolvedSections(),
        page: {
          heroTitle: page.heroTitle || product.name,
          heroSubtitle: page.heroSubtitle || product.tagline || '',
          heroImage: page.heroImage || '',
          heroVideoUrl: page.heroVideoUrl || '',
          overviewContent: page.overviewContent || product.description || '',
          gettingStartedContent: page.gettingStartedContent || '',
          howItWorksContent: page.howItWorksContent || '',
          featureItems: page.featureItems || [],
          faqItems: page.faqItems || [],
          resourceLinks: page.resourceLinks || [],
          showTutorials: page.showTutorials !== false,
          seoTitle: page.seoTitle || '',
          seoDescription: page.seoDescription || '',
        },
      },
      related,
    },
  });
});

/* -------------------------------------------------------------------------
 * POST /api/portal/products/:productId/launch
 * Server-verified app launch. Ownership is re-checked here — never trusted.
 * ---------------------------------------------------------------------- */
const launchProduct = asyncHandler(async (req, res) => {
  const product = req.product; // set + access-checked by requireCustomerProductAccess
  if (req.accessMode !== 'owner') throw ApiError.forbidden('You do not have an active purchase for this product');

  if (product.accessMode === ACCESS_MODES.NONE || !product.launchUrl) {
    throw ApiError.badRequest('This product does not have a launchable app configured');
  }

  let launchUrl = product.launchUrl;

  // If the destination opts into SSO, hand it a short-lived signed proof of
  // entitlement. Until an app supports it this token is simply ignored — it is
  // never a permanent secret and never carries sensitive data in the query.
  if (product.accessMode === ACCESS_MODES.SIGNED_URL) {
    const token = signLaunchToken({
      customerId: req.customer._id,
      productId: product._id,
      email: req.customer.email,
    });
    const sep = launchUrl.includes('?') ? '&' : '?';
    launchUrl = `${launchUrl}${sep}launch_token=${encodeURIComponent(token)}`;
  }

  // Remember + log the launch.
  Customer.updateOne(
    { _id: req.customer._id },
    { $set: { lastOpenedProductId: product._id, lastOpenedProductAt: new Date() } }
  ).catch(() => null);
  AnalyticsEvent.track({
    type: 'product_launched',
    productId: product._id,
    customerId: req.customer._id,
    label: product.slug,
  });

  res.json({ success: true, data: { launchUrl } });
});

/* -------------------------------------------------------------------------
 * GET /api/portal/support/products — products eligible for a support request
 * ---------------------------------------------------------------------- */
const supportProducts = asyncHandler(async (req, res) => {
  const { products, byProductId } = await loadOwnedProducts(req.customer._id);
  res.json({
    success: true,
    data: {
      products: products.map((p) => productCard(new Product(p), byProductId.get(String(p._id)))),
      issueCategories: ISSUE_CATEGORIES,
    },
  });
});

/* -------------------------------------------------------------------------
 * POST /api/portal/support/start
 *
 * Verifies ownership server-side, opens (or resumes) a support session bound
 * to the AUTHENTICATED customer, and returns a support token the client uses
 * to drive the EXISTING support socket + /support endpoints. No second chat
 * engine, no duplicate inbox.
 * ---------------------------------------------------------------------- */
const startSupport = asyncHandler(async (req, res) => {
  const product = req.product; // access-checked (owner only — no discovery here)
  if (req.accessMode !== 'owner') throw ApiError.forbidden('You do not have access to this product');

  const mode = req.body.mode === 'team' || req.body.mode === 'human' ? 'human' : 'ai';

  const { session } = await presence.startAuthenticatedSession({
    product,
    customer: req.customer,
    currentPage: `/portal/support/${product.slug}/${mode === 'human' ? 'team' : 'ai'}`,
    userAgent: req.headers['user-agent'] || '',
    ip: req.ip,
  });

  const supportToken = signSupportToken({
    sessionId: session._id,
    productId: product._id,
    customerId: req.customer._id,
    anonymousId: session.anonymousId,
  });

  // Capture the intake details (issue category + description) as the opening
  // context. The actual conversation is created lazily on the first message by
  // the existing support flow, so nothing here duplicates that path.
  const intake = {
    category: ISSUE_CATEGORIES.includes(req.body.category) ? req.body.category : '',
    description: String(req.body.description || '').slice(0, 2000),
  };

  res.json({
    success: true,
    data: {
      supportToken,
      sessionId: String(session._id),
      mode,
      product: { _id: String(product._id), name: product.name, slug: product.slug, logo: product.logo },
      intake,
    },
  });
});

/* -------------------------------------------------------------------------
 * GET /api/portal/conversations — the customer's own threads
 * ---------------------------------------------------------------------- */
const listConversations = asyncHandler(async (req, res) => {
  const rows = await Conversation.find({ customerId: req.customer._id })
    .sort({ lastMessageAt: -1 })
    .limit(50)
    .populate('productId', 'name slug logo')
    .populate('assignedAgentId', 'name avatar title')
    .lean();

  res.json({
    success: true,
    data: rows.map((c) => ({
      _id: String(c._id),
      channel: c.channel, // 'ai' | 'human'
      status: c.status,
      subject: c.subject || '',
      lastMessagePreview: c.lastMessagePreview || '',
      lastMessageAt: c.lastMessageAt,
      unread: c.unreadForCustomer || 0,
      product: c.productId ? { name: c.productId.name, slug: c.productId.slug, logo: c.productId.logo } : null,
      agent: c.assignedAgentId
        ? { name: c.assignedAgentId.name, avatar: c.assignedAgentId.avatar, title: c.assignedAgentId.title }
        : null,
    })),
  });
});

/* -------------------------------------------------------------------------
 * Notifications
 * ---------------------------------------------------------------------- */
const listNotifications = asyncHandler(async (req, res) => {
  const [rows, unread] = await Promise.all([
    Notification.find({ customerId: req.customer._id }).sort({ createdAt: -1 }).limit(50).lean(),
    Notification.countDocuments({ customerId: req.customer._id, readAt: null }),
  ]);
  res.json({
    success: true,
    data: {
      unread,
      notifications: rows.map((n) => ({
        _id: String(n._id),
        type: n.type,
        title: n.title,
        body: n.body,
        link: n.link || '',
        read: Boolean(n.readAt),
        createdAt: n.createdAt,
      })),
    },
  });
});

const markNotificationRead = asyncHandler(async (req, res) => {
  const n = await Notification.findOneAndUpdate(
    { _id: req.params.id, customerId: req.customer._id },
    { $set: { readAt: new Date() } },
    { new: true }
  );
  if (!n) throw ApiError.notFound('Notification not found');
  res.json({ success: true, data: { _id: String(n._id), read: true } });
});

const markAllNotificationsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { customerId: req.customer._id, readAt: null },
    { $set: { readAt: new Date() } }
  );
  res.json({ success: true, data: { unread: 0 } });
});

/* -------------------------------------------------------------------------
 * Profile
 * ---------------------------------------------------------------------- */
const getProfile = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { customer: req.customer.toPortalJSON() } });
});

const updateProfile = asyncHandler(async (req, res) => {
  const customer = req.customer;
  if (req.body.name !== undefined) customer.name = String(req.body.name).trim().slice(0, 120);
  if (req.body.phone !== undefined) customer.phone = String(req.body.phone).trim().slice(0, 40);
  if (req.body.timezone !== undefined) customer.timezone = String(req.body.timezone).trim().slice(0, 60);
  await customer.save();
  res.json({ success: true, data: { customer: customer.toPortalJSON() } });
});

/**
 * POST /api/portal/products/refresh — re-check entitlements from the database.
 * Deliberately NOT a call out to JVZoo from the browser: it simply re-reads the
 * server-side entitlement table, which the webhook/CSV import keep current.
 */
const refreshPurchases = asyncHandler(async (req, res) => {
  const count = await CustomerProduct.countDocuments({
    customerId: req.customer._id,
    verified: true,
    purchaseStatus: PURCHASE_STATUS.ACTIVE,
  });
  res.json({ success: true, data: { productCount: count } });
});

module.exports = {
  getDashboard,
  listProducts,
  getProductPage,
  launchProduct,
  supportProducts,
  startSupport,
  listConversations,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getProfile,
  updateProfile,
  refreshPurchases,
};
