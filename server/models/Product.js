'use strict';

const mongoose = require('mongoose');
const slugify = require('slugify');
const {
  ACCESS_MODES,
  ACCESS_MODE_LIST,
  DASHBOARD_VISIBILITY,
  DASHBOARD_VISIBILITY_LIST,
  PRODUCT_PAGE_SECTIONS,
  PAGE_STATUS,
  PAGE_STATUS_LIST,
  OFFER_TYPES,
  OFFER_TYPE_LIST,
} = require('../utils/constants');

/**
 * One JVZoo offer that grants this internal product.
 *   externalProductId  the JVZoo product id (from `cproditem`)
 *   offerType          fe | oto | bundle | addon
 *   accessPlan         the plan this offer unlocks (written to CustomerProduct.plan)
 *   active             disabled mappings are ignored by the resolver
 */
const jvzooMappingSchema = new mongoose.Schema(
  {
    externalProductId: { type: String, required: true, trim: true },
    offerType: { type: String, enum: OFFER_TYPE_LIST, default: OFFER_TYPES.FE },
    accessPlan: { type: String, default: '', trim: true, maxlength: 80 },
    active: { type: Boolean, default: true },
  },
  { _id: false }
);

/** A CSS hex colour, or empty to fall back to the built-in default. */
const HEX = {
  validator: (v) => !v || /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v),
  message: (p) => `${p.value} is not a hex colour like #0a2346`,
};

const colour = (fallback) => ({ type: String, default: fallback, trim: true, validate: HEX });

/**
 * How this product's support page looks and reads.
 *
 * Every field is optional: a blank one falls back to the same default the
 * client ships with, so a product that has never been styled still renders the
 * standard immersive page.
 */
const supportPageSchema = new mongoose.Schema(
  {
    /* Identity and copy */
    assistantName: { type: String, default: '', trim: true, maxlength: 40 },
    assistantRole: { type: String, default: 'Support Assistant', trim: true, maxlength: 40 },
    welcomeText: { type: String, default: '', trim: true, maxlength: 400 },
    ctaText: { type: String, default: 'Start the conversation', trim: true, maxlength: 40 },
    assistantAvatar: { type: String, default: '', trim: true },
    showOnlineDot: { type: Boolean, default: true },

    /* Background */
    bgFrom: colour('#031126'),
    bgMid: colour('#0a2346'),
    bgTo: colour('#081a37'),
    glowColor: colour('#3c6eb4'),

    /* Accent — the CTA, the send key and the frame rim */
    accentFrom: colour('#ff8d1f'),
    accentTo: colour('#59d6df'),

    /* Message input bar. Applied as a tint over the dark bar, not a fill. */
    inputBg: colour('#ffffff'),
    inputBorder: colour('#ffffff'),
    inputText: colour('#ffffff'),

    /* Floating controls */
    showSound: { type: Boolean, default: true },
    showClose: { type: Boolean, default: true },
    closeUrl: { type: String, default: '', trim: true },
  },
  { _id: false }
);

/**
 * The customer-facing product page.
 *
 * Structured rather than a blob of HTML: every section is typed, so nothing
 * the admin types can become executable markup in a customer's browser. Rich
 * text fields hold plain text/markdown-ish content and are sanitised on write
 * (see utils/sanitize.js).
 */
const featureItemSchema = new mongoose.Schema(
  {
    title: { type: String, default: '', trim: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 1000 },
    icon: { type: String, default: '', trim: true, maxlength: 40 },
    imageUrl: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const faqItemSchema = new mongoose.Schema(
  {
    question: { type: String, default: '', trim: true, maxlength: 300 },
    answer: { type: String, default: '', maxlength: 4000 },
  },
  { _id: false }
);

const resourceLinkSchema = new mongoose.Schema(
  {
    label: { type: String, default: '', trim: true, maxlength: 120 },
    url: { type: String, default: '', trim: true },
    description: { type: String, default: '', maxlength: 400 },
    kind: { type: String, default: 'link', enum: ['link', 'doc', 'download', 'video'] },
  },
  { _id: false }
);

const portalPageSchema = new mongoose.Schema(
  {
    heroTitle: { type: String, default: '', trim: true, maxlength: 160 },
    heroSubtitle: { type: String, default: '', trim: true, maxlength: 300 },
    heroImage: { type: String, default: '', trim: true },
    heroVideoUrl: { type: String, default: '', trim: true },

    overviewContent: { type: String, default: '', maxlength: 20000 },
    gettingStartedContent: { type: String, default: '', maxlength: 20000 },
    howItWorksContent: { type: String, default: '', maxlength: 20000 },

    featureItems: { type: [featureItemSchema], default: [] },
    faqItems: { type: [faqItemSchema], default: [] },
    resourceLinks: { type: [resourceLinkSchema], default: [] },

    /** Section keys the customer may see, and the order to render them in. */
    visibleSections: { type: [String], default: () => [...PRODUCT_PAGE_SECTIONS] },
    sectionOrder: { type: [String], default: () => [...PRODUCT_PAGE_SECTIONS] },

    showTutorials: { type: Boolean, default: true },
    showRelated: { type: Boolean, default: true },

    pageStatus: { type: String, enum: PAGE_STATUS_LIST, default: PAGE_STATUS.PUBLISHED, index: true },
    seoTitle: { type: String, default: '', trim: true, maxlength: 160 },
    seoDescription: { type: String, default: '', maxlength: 320 },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Product name is required'], trim: true, maxlength: 120 },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9][a-z0-9-]*$/, 'Slug may only contain lowercase letters, numbers and hyphens'],
      index: true,
    },
    logo: { type: String, default: '' },
    description: { type: String, default: '', maxlength: 2000 },
    tagline: { type: String, default: '', maxlength: 200 },
    websiteUrl: { type: String, default: '' },
    loginUrl: { type: String, default: '' },
    docsUrl: { type: String, default: '' },
    supportEmail: { type: String, default: '' },
    brandColor: { type: String, default: '#4f46e5' },
    aiWelcomeMessage: {
      type: String,
      default: 'Hi! I can help with setup, features, billing and troubleshooting. What do you need help with?',
      maxlength: 1000,
    },
    aiPersona: {
      type: String,
      default: '',
      maxlength: 1000,
    },
    active: { type: Boolean, default: true, index: true },
    // `default` has to be a factory, otherwise an existing product read back
    // before it was ever styled comes through as undefined instead of defaults.
    supportPage: { type: supportPageSchema, default: () => ({}) },

    /* -------------------------------------------------------------------
     * Membership portal
     * ---------------------------------------------------------------- */

    /**
     * Structured JVZoo mapping. One internal product can be granted by several
     * JVZoo offers (front-end plus its OTOs/bundles/add-ons); each mapping
     * carries its own offer type and access plan, so an OTO is never blindly
     * treated as the front-end. A JVZoo id must not be `active` on two internal
     * products at once — enforced by an application-level check in the product
     * controller (cross-document uniqueness can't be a Mongo index).
     */
    jvzooMappings: {
      type: [jvzooMappingSchema],
      default: [],
    },

    /**
     * DEPRECATED legacy flat list. Superseded by `jvzooMappings`. Kept in the
     * schema so pre-existing documents remain valid and the resolver can still
     * fall back to it; new writes go to `jvzooMappings`.
     */
    jvzooProductIds: { type: [String], default: [], index: true },

    /** Where a non-owner is sent to buy. Shown on discovery cards only. */
    purchaseUrl: { type: String, default: '', trim: true },
    /** Where an owner is sent by "Open App". Never trusted from the browser. */
    launchUrl: { type: String, default: '', trim: true },
    accessMode: { type: String, enum: ACCESS_MODE_LIST, default: ACCESS_MODES.EXTERNAL_URL },

    /** Card art and copy for the dashboard grid (falls back to logo/tagline). */
    cardImage: { type: String, default: '', trim: true },
    cardDescription: { type: String, default: '', maxlength: 400 },

    featured: { type: Boolean, default: false, index: true },
    dashboardVisibility: {
      type: String,
      enum: DASHBOARD_VISIBILITY_LIST,
      default: DASHBOARD_VISIBILITY.OWNERS,
      index: true,
    },
    sortOrder: { type: Number, default: 0, index: true },

    portalPage: { type: portalPageSchema, default: () => ({}) },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

productSchema.pre('validate', function ensureSlug(next) {
  if (!this.slug && this.name) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  } else if (this.slug) {
    this.slug = slugify(this.slug, { lower: true, strict: true });
  }
  next();
});

/**
 * External ids are trimmed and de-duplicated on write — JVZoo ids arrive as
 * strings and a stray space in the admin form would otherwise silently break
 * every future purchase of that offer.
 */
productSchema.pre('validate', function normaliseExternalIds(next) {
  if (Array.isArray(this.jvzooProductIds)) {
    this.jvzooProductIds = [
      ...new Set(this.jvzooProductIds.map((id) => String(id || '').trim()).filter(Boolean)),
    ];
  }
  if (Array.isArray(this.jvzooMappings)) {
    const seen = new Set();
    this.jvzooMappings = this.jvzooMappings
      .map((m) => ({
        externalProductId: String(m.externalProductId || '').trim(),
        offerType: m.offerType || OFFER_TYPES.FE,
        accessPlan: String(m.accessPlan || '').trim(),
        active: m.active !== false,
      }))
      .filter((m) => {
        if (!m.externalProductId) return false;
        // Collapse duplicate ids within this one product.
        if (seen.has(m.externalProductId)) return false;
        seen.add(m.externalProductId);
        return true;
      });
  }
  next();
});

/**
 * Every external id this product actively grants, from the structured mappings
 * plus the deprecated flat list. Used by the cross-product uniqueness check.
 */
productSchema.methods.activeExternalIds = function activeExternalIds() {
  const fromMappings = (this.jvzooMappings || []).filter((m) => m.active).map((m) => m.externalProductId);
  const fromLegacy = this.jvzooProductIds || [];
  return [...new Set([...fromMappings, ...fromLegacy].map((id) => String(id).trim()).filter(Boolean))];
};

productSchema.virtual('supportUrl').get(function supportUrl() {
  return `/support/${this.slug}`;
});

productSchema.virtual('portalUrl').get(function portalUrl() {
  return `/portal/products/${this.slug}`;
});

/** Sections to render, in order, skipping anything hidden. */
productSchema.methods.resolvedSections = function resolvedSections() {
  const page = this.portalPage || {};
  const visible = new Set(
    (page.visibleSections && page.visibleSections.length ? page.visibleSections : PRODUCT_PAGE_SECTIONS)
  );
  const order = page.sectionOrder && page.sectionOrder.length ? page.sectionOrder : PRODUCT_PAGE_SECTIONS;
  // Anything the admin added to visibleSections but not to sectionOrder still
  // renders, at the end, rather than disappearing without explanation.
  const ordered = order.filter((s) => visible.has(s));
  const missing = [...visible].filter((s) => !ordered.includes(s) && PRODUCT_PAGE_SECTIONS.includes(s));
  return [...ordered, ...missing];
};

module.exports = mongoose.model('Product', productSchema);
