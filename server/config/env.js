'use strict';

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const bool = (v, fallback = false) => {
  if (v === undefined || v === null || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
};

const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: (process.env.NODE_ENV || 'development') === 'production',
  port: num(process.env.PORT, 5000),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/support_platform',

  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  supportTokenExpiresIn: process.env.SUPPORT_TOKEN_EXPIRES_IN || '12h',

  /** Public origin of this deployment. Used for password-reset links only. */
  appBaseUrl: (process.env.APP_BASE_URL || '').replace(/\/+$/, ''),

  /** Customer membership portal (separate from staff auth on purpose). */
  portal: {
    tokenExpiresIn: process.env.CUSTOMER_TOKEN_EXPIRES_IN || '2h',
    cookieName: process.env.CUSTOMER_COOKIE_NAME || 'portal_session',
    /**
     * Cross-site cookies need SameSite=None; Secure. That only works over
     * HTTPS, so it is opt-in: a split deployment sets it, a single-origin one
     * leaves it off and gets the stricter Lax cookie.
     */
    crossSiteCookies: bool(process.env.CUSTOMER_COOKIE_CROSS_SITE, false),
    /** Minutes a password-reset token stays valid. */
    resetTokenMinutes: num(process.env.CUSTOMER_RESET_TOKEN_MINUTES, 60),
    /** Minutes a signed app-launch token stays valid. */
    launchTokenMinutes: num(process.env.LAUNCH_TOKEN_MINUTES, 5),
    /**
     * Require a verified email before a customer can sign in.
     * Off by default because no mail transport is wired up yet — turning it on
     * without one would lock every new registration out. See README.
     */
    requireEmailVerification: bool(process.env.CUSTOMER_REQUIRE_EMAIL_VERIFICATION, false),
  },

  /**
   * JVZoo IPN.
   *
   * `secret` is the value configured in the JVZoo seller dashboard. It never
   * reaches the browser. When the webhook is enabled but no secret is set the
   * adapter refuses to mark anything verified — see
   * services/integrations/jvzooService.js.
   */
  jvzoo: {
    ipnSecret: process.env.JVZOO_IPN_SECRET || '',
    webhookEnabled: bool(process.env.JVZOO_WEBHOOK_ENABLED, false),
    /**
     * Production gate. Stays false until the operator has validated JVZoo's
     * verification scheme against a real test IPN. While false the verifier
     * returns BLOCKED and no event can grant access — see jvzooVerifier.js.
     */
    verificationConfirmed: bool(process.env.JVZOO_VERIFICATION_CONFIRMED, false),
    get configured() {
      return Boolean(process.env.JVZOO_IPN_SECRET);
    },
  },

  /**
   * Transactional email (Resend).
   *
   * With no RESEND_API_KEY the mail service is disabled and simply logs what it
   * would have sent — sign-up, password-reset and CSV-import flows keep working,
   * they just don't deliver mail. `from` must be an address on a domain you have
   * verified in Resend (for a quick test, `onboarding@resend.dev` only delivers
   * to the Resend account owner). See services/mail/index.js.
   */
  mail: {
    apiKey: process.env.RESEND_API_KEY || '',
    from: process.env.MAIL_FROM || '',
    replyTo: process.env.MAIL_REPLY_TO || '',
    appName: process.env.APP_NAME || 'Customer Support',
    brandColor: process.env.MAIL_BRAND_COLOR || '#4f46e5',
    /** Ms to wait between batch calls so bulk sends stay under Resend's rate limit. */
    batchDelayMs: num(process.env.MAIL_BATCH_DELAY_MS, 600),
    /** Global kill switch for the "email everyone" step of a CSV import. */
    csvImportNotify: bool(process.env.MAIL_CSV_IMPORT_NOTIFY, true),
    get enabled() {
      return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
    },
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
    embeddingDim: num(process.env.GEMINI_EMBEDDING_DIM, 768),
    get enabled() {
      return Boolean(process.env.GEMINI_API_KEY);
    },
  },

  rag: {
    atlasVectorSearch: bool(process.env.ATLAS_VECTOR_SEARCH, false),
    vectorIndexName: process.env.VECTOR_INDEX_NAME || 'knowledge_vector_index',
    topK: num(process.env.RAG_TOP_K, 6),
    minScore: num(process.env.RAG_MIN_SCORE, 0.55),
  },

  uploads: {
    maxMb: num(process.env.MAX_UPLOAD_MB, 10),
    dir: path.join(__dirname, '..', 'uploads'),
  },

  seed: {
    adminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@support.local',
    adminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin@12345',
  },
};

// --- Fail fast on things that would silently break security -----------------
if (!env.jwtSecret || env.jwtSecret.length < 24) {
  if (env.isProd) {
    throw new Error('JWT_SECRET is missing or too short. Set a long random value in server/.env');
  }
  // Dev convenience only: never happens in production because of the throw above.
  env.jwtSecret = env.jwtSecret || 'insecure_dev_secret_do_not_use_in_production_0001';
  // eslint-disable-next-line no-console
  console.warn('[env] WARNING: weak JWT_SECRET in use (development only).');
}

/**
 * The webhook may be switched on without a secret (for example while the
 * seller dashboard is still being configured). That is allowed — the adapter
 * simply cannot mark anything verified, so nothing gets entitled — but it must
 * be loud, because a silently unverified webhook looks like it is working.
 */
if (env.jvzoo.webhookEnabled && !env.jvzoo.ipnSecret) {
  // eslint-disable-next-line no-console
  console.warn(
    '[env] JVZOO_WEBHOOK_ENABLED is on but JVZOO_IPN_SECRET is empty. ' +
      'Incoming IPNs will be stored for audit and rejected as unverified — no access will be granted.'
  );
}

if (env.isProd && !env.appBaseUrl) {
  // eslint-disable-next-line no-console
  console.warn('[env] APP_BASE_URL is not set. Password-reset links will fall back to CLIENT_URL.');
}

module.exports = env;
