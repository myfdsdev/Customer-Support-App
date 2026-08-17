'use strict';

const ROLES = {
  SUPER_ADMIN: 'super_admin',
  SUPPORT_MANAGER: 'support_manager',
  SUPPORT_AGENT: 'support_agent',
  MARKETING_MANAGER: 'marketing_manager',
};

const ROLE_LIST = Object.values(ROLES);

/** Roles that can work conversations / tickets. */
const AGENT_ROLES = [ROLES.SUPER_ADMIN, ROLES.SUPPORT_MANAGER, ROLES.SUPPORT_AGENT];
/** Roles that bypass per-product agent assignment. */
const GLOBAL_ROLES = [ROLES.SUPER_ADMIN, ROLES.SUPPORT_MANAGER];

const CONVERSATION_STATUS = {
  NEW: 'new',
  UNASSIGNED: 'unassigned',
  ACTIVE: 'active',
  WAITING_CUSTOMER: 'waiting_customer',
  WAITING_TEAM: 'waiting_team',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
};
const CONVERSATION_STATUS_LIST = Object.values(CONVERSATION_STATUS);
const OPEN_STATUSES = [
  CONVERSATION_STATUS.NEW,
  CONVERSATION_STATUS.UNASSIGNED,
  CONVERSATION_STATUS.ACTIVE,
  CONVERSATION_STATUS.WAITING_CUSTOMER,
  CONVERSATION_STATUS.WAITING_TEAM,
];

const PRIORITY = { LOW: 'low', NORMAL: 'normal', HIGH: 'high', URGENT: 'urgent' };
const PRIORITY_LIST = Object.values(PRIORITY);

const SENDER_TYPE = { CUSTOMER: 'customer', AI: 'ai', AGENT: 'agent', SYSTEM: 'system' };
const SENDER_TYPE_LIST = Object.values(SENDER_TYPE);

const MESSAGE_TYPE = {
  TEXT: 'text',
  AI_ANSWER: 'ai_answer',
  IMAGE: 'image',
  FILE: 'file',
  SYSTEM: 'system',
  HANDOFF: 'handoff',
};
const MESSAGE_TYPE_LIST = Object.values(MESSAGE_TYPE);

const KNOWLEDGE_CATEGORIES = [
  'Getting Started',
  'Features',
  'FAQs',
  'Troubleshooting',
  'Billing',
  'Payment',
  'Credits',
  'Login',
  'Account',
  'API',
  'Export',
  'Upload',
  'Policies',
  'Refund',
  'Subscription',
];

const TICKET_STATUS = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  WAITING_CUSTOMER: 'waiting_customer',
  WAITING_TEAM: 'waiting_team',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
};
const TICKET_STATUS_LIST = Object.values(TICKET_STATUS);
const TICKET_OPEN_STATUSES = [
  TICKET_STATUS.OPEN,
  TICKET_STATUS.IN_PROGRESS,
  TICKET_STATUS.WAITING_CUSTOMER,
  TICKET_STATUS.WAITING_TEAM,
];

const TICKET_CATEGORIES = [
  'Technical',
  'Billing',
  'Refund',
  'Account',
  'Bug',
  'Feature Request',
  'Other',
];

const TEAMS = ['Technical Support', 'Billing Team', 'Account Team', 'Engineering', 'General Support'];

/**
 * Intents. `sensitive` intents suppress every marketing surface and force
 * transactional questions towards verified data or a human.
 */
const INTENTS = {
  GREETING: 'GREETING',
  FEATURE_HELP: 'FEATURE_HELP',
  HOW_TO: 'HOW_TO',
  TROUBLESHOOTING: 'TROUBLESHOOTING',
  BUG_REPORT: 'BUG_REPORT',
  BILLING: 'BILLING',
  PAYMENT_ISSUE: 'PAYMENT_ISSUE',
  REFUND: 'REFUND',
  SUBSCRIPTION: 'SUBSCRIPTION',
  CREDITS: 'CREDITS',
  ACCOUNT: 'ACCOUNT',
  LOGIN_ISSUE: 'LOGIN_ISSUE',
  API_HELP: 'API_HELP',
  PRICING: 'PRICING',
  TRAINING_REQUEST: 'TRAINING_REQUEST',
  HUMAN_REQUEST: 'HUMAN_REQUEST',
  COMPLAINT: 'COMPLAINT',
  OTHER: 'OTHER',
};
const INTENT_LIST = Object.values(INTENTS);

/** Never answered from model memory — only verified backend data or a human. */
const SENSITIVE_INTENTS = [
  INTENTS.PAYMENT_ISSUE,
  INTENTS.REFUND,
  INTENTS.SUBSCRIPTION,
  INTENTS.CREDITS,
  INTENTS.COMPLAINT,
  INTENTS.BUG_REPORT,
];

/** Intents that must never be followed by a product recommendation. */
const NO_MARKETING_INTENTS = [
  INTENTS.PAYMENT_ISSUE,
  INTENTS.REFUND,
  INTENTS.SUBSCRIPTION,
  INTENTS.COMPLAINT,
  INTENTS.LOGIN_ISSUE,
  INTENTS.ACCOUNT,
  INTENTS.BUG_REPORT,
];

const PRESENCE = { ONLINE: 'online', AWAY: 'away', OFFLINE: 'offline' };

const ANNOUNCEMENT_TYPES = [
  'Maintenance',
  'New Feature',
  'Product Update',
  'Training Update',
  'Service Notice',
  'General Announcement',
];

/**
 * Placements a marketing card can be pinned to.
 *
 * The first five are the original support-surface placements and must stay in
 * the list — existing Recommendation documents already reference them and the
 * enum would reject them on save otherwise. The `customer_dashboard_*` and
 * `product_page_related` entries are the membership-portal surfaces.
 */
const RECOMMENDATION_PLACEMENTS = [
  'support_homepage',
  'whats_new',
  'training_page',
  'after_resolution',
  'knowledge_footer',
  'customer_dashboard_featured',
  'customer_dashboard_recommended',
  'customer_dashboard_whats_new',
  'product_page_related',
];

/** Placements rendered by the customer membership portal. */
const PORTAL_PLACEMENTS = [
  'customer_dashboard_featured',
  'customer_dashboard_recommended',
  'customer_dashboard_whats_new',
  'product_page_related',
];

/** Label rendered on a portal marketing card. Never left blank — the portal
 *  must always disclose that a card is promotional. */
const RECOMMENDATION_BADGES = ['New', 'Featured', 'Recommended', 'Upgrade', 'Add-on'];

/* -------------------------------------------------------------------------
 * Staff capabilities
 *
 * Roles stay exactly as they were; capabilities are a named layer on top so a
 * route can say what it needs instead of enumerating roles. A support agent
 * deliberately gets neither integrations nor marketing.
 * ---------------------------------------------------------------------- */
const CAPABILITIES = {
  MANAGE_INTEGRATIONS: 'manage_integrations',
  MANAGE_PORTAL_CONTENT: 'manage_portal_content',
  MANAGE_PRODUCTS: 'manage_products',
  MANAGE_MARKETING: 'manage_marketing',
  MANAGE_ANNOUNCEMENTS: 'manage_announcements',
  MANAGE_TEAM: 'manage_team',
  WORK_INBOX: 'work_inbox',
  VIEW_CUSTOMERS: 'view_customers',
  MANAGE_KNOWLEDGE: 'manage_knowledge',
};
const CAPABILITY_LIST = Object.values(CAPABILITIES);

const ROLE_CAPABILITIES = {
  [ROLES.SUPER_ADMIN]: CAPABILITY_LIST,
  [ROLES.SUPPORT_MANAGER]: [
    CAPABILITIES.MANAGE_PRODUCTS,
    CAPABILITIES.MANAGE_PORTAL_CONTENT,
    CAPABILITIES.MANAGE_ANNOUNCEMENTS,
    CAPABILITIES.MANAGE_TEAM,
    CAPABILITIES.WORK_INBOX,
    CAPABILITIES.VIEW_CUSTOMERS,
    CAPABILITIES.MANAGE_KNOWLEDGE,
  ],
  [ROLES.SUPPORT_AGENT]: [
    CAPABILITIES.WORK_INBOX,
    CAPABILITIES.VIEW_CUSTOMERS,
    CAPABILITIES.MANAGE_KNOWLEDGE,
  ],
  [ROLES.MARKETING_MANAGER]: [
    CAPABILITIES.MANAGE_MARKETING,
    CAPABILITIES.MANAGE_ANNOUNCEMENTS,
    CAPABILITIES.MANAGE_PORTAL_CONTENT,
  ],
};

const roleHasCapability = (role, capability) =>
  (ROLE_CAPABILITIES[role] || []).includes(capability);

/* -------------------------------------------------------------------------
 * Payments / entitlements
 * ---------------------------------------------------------------------- */
const PAYMENT_PROVIDERS = { JVZOO: 'jvzoo', MANUAL: 'manual', CSV: 'csv_import' };
const PAYMENT_PROVIDER_LIST = Object.values(PAYMENT_PROVIDERS);

/** Normalised event types. The JVZoo adapter maps its own vocabulary onto these. */
const PAYMENT_EVENT_TYPES = {
  SALE: 'sale',
  BILL: 'bill',
  UPSELL: 'upsell',
  REFUND: 'refund',
  CHARGEBACK: 'chargeback',
  CANCEL: 'cancel_rebill',
  REINSTATE: 'reinstate',
  UNKNOWN: 'unknown',
};
const PAYMENT_EVENT_TYPE_LIST = Object.values(PAYMENT_EVENT_TYPES);

/** Event types that grant access, and those that take it away. */
const GRANTING_EVENT_TYPES = [
  PAYMENT_EVENT_TYPES.SALE,
  PAYMENT_EVENT_TYPES.BILL,
  PAYMENT_EVENT_TYPES.UPSELL,
  PAYMENT_EVENT_TYPES.REINSTATE,
];
const REVOKING_EVENT_TYPES = [
  PAYMENT_EVENT_TYPES.REFUND,
  PAYMENT_EVENT_TYPES.CHARGEBACK,
  PAYMENT_EVENT_TYPES.CANCEL,
];

const PURCHASE_STATUS = {
  ACTIVE: 'active',
  REFUNDED: 'refunded',
  CHARGEBACK: 'chargeback',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  PENDING: 'pending',
};
const PURCHASE_STATUS_LIST = Object.values(PURCHASE_STATUS);

const VERIFICATION_STATUS = {
  VERIFIED: 'verified',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  UNCONFIGURED: 'unconfigured',
};
const VERIFICATION_STATUS_LIST = Object.values(VERIFICATION_STATUS);

/* -------------------------------------------------------------------------
 * Customer portal
 * ---------------------------------------------------------------------- */

/** How a purchased product is opened from the portal. */
const ACCESS_MODES = {
  /** Send the customer to the admin-configured launch URL. */
  EXTERNAL_URL: 'external_url',
  /** Same, but with a short-lived signed launch token appended. */
  SIGNED_URL: 'signed_url',
  /** No app to open — the product page is the whole deliverable. */
  NONE: 'none',
};
const ACCESS_MODE_LIST = Object.values(ACCESS_MODES);

const DASHBOARD_VISIBILITY = {
  /** Shown to owners on their dashboard. */
  OWNERS: 'owners',
  /** Shown to everyone, owned or not (product discovery). */
  EVERYONE: 'everyone',
  /** Never surfaced on the dashboard. */
  HIDDEN: 'hidden',
};
const DASHBOARD_VISIBILITY_LIST = Object.values(DASHBOARD_VISIBILITY);

/** Sections of the customer-facing product page, in their default order. */
const PRODUCT_PAGE_SECTIONS = [
  'hero',
  'overview',
  'getting_started',
  'features',
  'how_it_works',
  'updates',
  'tutorials',
  'resources',
  'faq',
  'support',
  'related',
];

const PAGE_STATUS = { DRAFT: 'draft', PUBLISHED: 'published' };
const PAGE_STATUS_LIST = Object.values(PAGE_STATUS);

/** The only categories the portal support form offers. */
const ISSUE_CATEGORIES = [
  'Login or Access',
  'App Not Working',
  'Billing',
  'How to Use',
  'Other',
];

const NOTIFICATION_TYPES = {
  PRODUCT_UPDATE: 'product_update',
  ANNOUNCEMENT: 'announcement',
  SUPPORT_REPLY: 'support_reply',
  CONVERSATION_ASSIGNED: 'conversation_assigned',
  CONVERSATION_RESOLVED: 'conversation_resolved',
  ACCESS_GRANTED: 'access_granted',
  ACCESS_REVOKED: 'access_revoked',
};
const NOTIFICATION_TYPE_LIST = Object.values(NOTIFICATION_TYPES);

const FALLBACK_ANSWER =
  "I don't have enough verified information to answer this accurately. I can connect you with our support team.";

module.exports = {
  ROLES,
  ROLE_LIST,
  AGENT_ROLES,
  GLOBAL_ROLES,
  CONVERSATION_STATUS,
  CONVERSATION_STATUS_LIST,
  OPEN_STATUSES,
  PRIORITY,
  PRIORITY_LIST,
  SENDER_TYPE,
  SENDER_TYPE_LIST,
  MESSAGE_TYPE,
  MESSAGE_TYPE_LIST,
  KNOWLEDGE_CATEGORIES,
  TICKET_STATUS,
  TICKET_STATUS_LIST,
  TICKET_OPEN_STATUSES,
  TICKET_CATEGORIES,
  TEAMS,
  INTENTS,
  INTENT_LIST,
  SENSITIVE_INTENTS,
  NO_MARKETING_INTENTS,
  PRESENCE,
  ANNOUNCEMENT_TYPES,
  RECOMMENDATION_PLACEMENTS,
  PORTAL_PLACEMENTS,
  RECOMMENDATION_BADGES,
  CAPABILITIES,
  CAPABILITY_LIST,
  ROLE_CAPABILITIES,
  roleHasCapability,
  PAYMENT_PROVIDERS,
  PAYMENT_PROVIDER_LIST,
  PAYMENT_EVENT_TYPES,
  PAYMENT_EVENT_TYPE_LIST,
  GRANTING_EVENT_TYPES,
  REVOKING_EVENT_TYPES,
  PURCHASE_STATUS,
  PURCHASE_STATUS_LIST,
  VERIFICATION_STATUS,
  VERIFICATION_STATUS_LIST,
  ACCESS_MODES,
  ACCESS_MODE_LIST,
  DASHBOARD_VISIBILITY,
  DASHBOARD_VISIBILITY_LIST,
  PRODUCT_PAGE_SECTIONS,
  PAGE_STATUS,
  PAGE_STATUS_LIST,
  ISSUE_CATEGORIES,
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_LIST,
  FALLBACK_ANSWER,
};
