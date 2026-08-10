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

const RECOMMENDATION_PLACEMENTS = [
  'support_homepage',
  'whats_new',
  'training_page',
  'after_resolution',
  'knowledge_footer',
];

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
  FALLBACK_ANSWER,
};
