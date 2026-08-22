'use strict';

const env = require('../../config/env');
const logger = require('../../utils/logger');
const templates = require('./templates');

/**
 * Resend-backed transactional mail.
 *
 * Design goals:
 *   1. NEVER break a request. Sending mail is best-effort: every function here
 *      catches its own errors and returns a result object instead of throwing,
 *      so a signup or a CSV import never fails just because email did.
 *   2. Degrade gracefully. With no RESEND_API_KEY configured the service is
 *      "disabled" and simply logs what it *would* have sent (including any
 *      action link), so the auth/import flows stay fully testable in dev — the
 *      same behaviour the controllers used to hand-roll.
 *   3. Scale to bulk. CSV imports fan out through Resend's batch endpoint
 *      (100 messages/call) with a gentle delay between calls to stay under the
 *      provider rate limit.
 *
 * The Resend SDK returns `{ data, error }` and does not throw on API errors, so
 * we normalise both into a single `{ ok, id?, error? }` shape.
 */

const MAX_BATCH = 100; // Resend hard limit per batch.send() call
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Lazily-constructed singleton so a missing/uninstalled SDK never crashes boot.
let _client;
let _clientTried = false;

function client() {
  if (_clientTried) return _client;
  _clientTried = true;
  if (!env.mail.apiKey) return (_client = null);
  try {
    // eslint-disable-next-line global-require
    const { Resend } = require('resend');
    _client = new Resend(env.mail.apiKey);
  } catch (err) {
    logger.warn(`[mail] Resend SDK not available (${err.message}). Emails will be logged, not sent.`);
    _client = null;
  }
  return _client;
}

/** True when a real transport is configured (API key + a From address). */
function isEnabled() {
  return Boolean(env.mail.apiKey && env.mail.from && client());
}

/** Public origin used to build links in emails. */
function baseUrl() {
  const raw = env.appBaseUrl || String(env.clientUrl || '').split(',')[0].trim() || '';
  return raw.replace(/\/+$/, '');
}

const cfg = () => ({ appName: env.mail.appName, brandColor: env.mail.brandColor });

/**
 * Send one email. Never throws.
 * @returns {Promise<{ok:boolean, id?:string, skipped?:boolean, error?:string}>}
 */
async function sendEmail({ to, subject, html, text, replyTo }) {
  if (!to) return { ok: false, error: 'no recipient' };

  if (!isEnabled()) {
    // Dev/unconfigured fallback: make the message visible so flows are testable.
    logger.info(`[mail] (not sent — mail disabled) to=${to} subject="${subject}"`);
    return { ok: false, skipped: true };
  }

  try {
    const { data, error } = await client().emails.send({
      from: env.mail.from,
      to,
      subject,
      html,
      text,
      replyTo: replyTo || env.mail.replyTo || undefined,
    });
    if (error) {
      logger.error(`[mail] send failed to=${to}: ${error.message || error.name || 'unknown error'}`);
      return { ok: false, error: error.message || 'send failed' };
    }
    return { ok: true, id: data && data.id };
  } catch (err) {
    logger.error(`[mail] send threw to=${to}: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

/**
 * Send many emails via the batch endpoint, chunked and paced. Never throws.
 * @param {Array<{to,subject,html,text}>} messages
 * @returns {Promise<{sent:number, failed:number, skipped:boolean, errors:string[]}>}
 */
async function sendBatch(messages) {
  const list = (messages || []).filter((m) => m && m.to);
  if (!list.length) return { sent: 0, failed: 0, skipped: false, errors: [] };

  if (!isEnabled()) {
    logger.info(`[mail] (not sent — mail disabled) batch of ${list.length} message(s) suppressed`);
    return { sent: 0, failed: list.length, skipped: true, errors: [] };
  }

  const payload = list.map((m) => ({
    from: env.mail.from,
    to: m.to,
    subject: m.subject,
    html: m.html,
    text: m.text,
    replyTo: env.mail.replyTo || undefined,
  }));

  let sent = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < payload.length; i += MAX_BATCH) {
    const chunk = payload.slice(i, i + MAX_BATCH);
    try {
      // eslint-disable-next-line no-await-in-loop
      const { data, error } = await client().batch.send(chunk);
      if (error) {
        failed += chunk.length;
        errors.push(error.message || 'batch failed');
        logger.error(`[mail] batch chunk failed (${chunk.length} msgs): ${error.message || 'unknown'}`);
      } else {
        const okCount = (data && Array.isArray(data.data) ? data.data.length : chunk.length);
        sent += okCount;
      }
    } catch (err) {
      failed += chunk.length;
      errors.push(err.message);
      logger.error(`[mail] batch chunk threw (${chunk.length} msgs): ${err.message}`);
    }
    // Pace the next call to respect the provider rate limit.
    if (i + MAX_BATCH < payload.length && env.mail.batchDelayMs > 0) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(env.mail.batchDelayMs);
    }
  }

  logger.info(`[mail] batch complete: ${sent} sent, ${failed} failed`);
  return { sent, failed, skipped: false, errors };
}

/* ------------------------------------------------------------------ *
 * High-level, flow-specific helpers.
 *
 * Each builds a template and dispatches it. When the transport is disabled they
 * still log the actionable link so the corresponding flow can be exercised in
 * development without a Resend key.
 * ------------------------------------------------------------------ */

/** Sent on portal sign-up (when email verification is NOT required). */
async function sendWelcomeEmail(customer) {
  const to = customer && customer.email;
  if (!to) return { ok: false, error: 'no email' };
  const msg = templates.welcome({ ...cfg(), name: customer.name, loginUrl: `${baseUrl()}/login` });
  return sendEmail({ to, subject: msg.subject, html: msg.html, text: msg.text });
}

/** Sent on portal sign-up when email verification IS required. */
async function sendVerificationEmail(customer, verifyUrl) {
  const to = customer && customer.email;
  if (!to) return { ok: false, error: 'no email' };
  if (!isEnabled()) logger.info(`[portal] Email verification link: ${verifyUrl}`);
  const msg = templates.verifyEmail({
    ...cfg(),
    name: customer.name,
    verifyUrl,
    expiresMinutes: env.portal.resetTokenMinutes,
  });
  return sendEmail({ to, subject: msg.subject, html: msg.html, text: msg.text });
}

/** Sent on forgot-password. */
async function sendPasswordResetEmail(customer, resetUrl) {
  const to = customer && customer.email;
  if (!to) return { ok: false, error: 'no email' };
  if (!isEnabled()) logger.info(`[portal] Password reset link: ${resetUrl}`);
  const msg = templates.passwordReset({
    ...cfg(),
    name: customer.name,
    resetUrl,
    expiresMinutes: env.portal.resetTokenMinutes,
  });
  return sendEmail({ to, subject: msg.subject, html: msg.html, text: msg.text });
}

/**
 * Sent to every customer granted access in a CSV import.
 * @param {Array<{email,name,hasPortalAccount}>} recipients
 * @param {{productName:string}} opts
 */
async function sendAccessGrantedBatch(recipients, { productName } = {}) {
  const login = `${baseUrl()}/login`;
  const register = `${baseUrl()}/register`;
  const messages = (recipients || [])
    .filter((r) => r && r.email)
    .map((r) => {
      const msg = templates.accessGranted({
        ...cfg(),
        name: r.name,
        productName,
        hasPortalAccount: Boolean(r.hasPortalAccount),
        actionUrl: r.hasPortalAccount ? login : register,
      });
      return { to: r.email, subject: msg.subject, html: msg.html, text: msg.text };
    });
  return sendBatch(messages);
}

module.exports = {
  isEnabled,
  baseUrl,
  sendEmail,
  sendBatch,
  sendWelcomeEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendAccessGrantedBatch,
};
