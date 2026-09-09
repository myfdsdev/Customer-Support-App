'use strict';

const env = require('../../config/env');
const logger = require('../../utils/logger');
const { VERIFICATION_STATUS } = require('../../utils/constants');

/**
 * Relays an accepted JVZoo IPN to a second system.
 *
 * JVZoo posts to ONE URL per product, but two systems need every notification:
 * this platform (which owns the CRM record and the portal entitlement) and the
 * vendor app that actually activates the customer's account. So JVZoo points
 * here, and this re-posts the same body downstream — the vendor app sees
 * exactly what it would have seen if JVZoo had called it directly.
 *
 * What is NOT relayed: a notification whose signature was present and WRONG.
 * That is a forgery, and passing it on would turn this endpoint into a laundry
 * for fake sales against a downstream that may not verify anything itself.
 *
 * Everything else IS relayed, including events this platform could not act on
 * (unmapped product, or verification still gated behind
 * JVZOO_VERIFICATION_CONFIRMED). The downstream is not ours to gatekeep, and
 * withholding during our own setup window would silently cut off real
 * customers' access.
 *
 * Fire-and-forget by design: JVZoo retries on anything but a prompt 200, so a
 * slow or dead downstream must never delay or fail our acknowledgement. Nothing
 * here throws — every failure is logged and swallowed.
 */

/** Verification states that must never be passed on. */
const NEVER_FORWARD = new Set([VERIFICATION_STATUS.FAILED]);

function isEnabled() {
  return Boolean(env.jvzoo.forwardUrl);
}

/**
 * @param {object} body          the parsed IPN fields, as received
 * @param {object} verification  the result from jvzooVerifier.verify()
 * @returns {Promise<{forwarded:boolean, reason?:string, status?:number}>}
 */
async function forward(body, verification) {
  const url = env.jvzoo.forwardUrl;
  if (!url) return { forwarded: false, reason: 'disabled' };

  if (NEVER_FORWARD.has(verification?.status)) {
    logger.warn(`JVZoo relay skipped: notification failed signature verification (${verification.reason || ''}).`);
    return { forwarded: false, reason: 'failed_verification' };
  }

  // Re-encoded rather than piped: the body has already been parsed by the time
  // we get here, and the downstream reads fields, not bytes.
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(body || {})) {
    if (value === undefined || value === null) continue;
    form.append(key, String(value));
  }
  if ([...form.keys()].length === 0) return { forwarded: false, reason: 'empty_body' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.jvzoo.forwardTimeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      signal: controller.signal,
    });

    if (!res.ok) {
      logger.error(`JVZoo relay to ${url} returned ${res.status}. The downstream did not accept the event.`);
      return { forwarded: false, reason: 'downstream_error', status: res.status };
    }

    logger.info(`JVZoo relay to ${url} ok (${res.status}).`);
    return { forwarded: true, status: res.status };
  } catch (err) {
    const reason = err?.name === 'AbortError' ? 'timeout' : err?.message || 'unknown';
    logger.error(`JVZoo relay to ${url} failed: ${reason}.`);
    return { forwarded: false, reason };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { forward, isEnabled };
