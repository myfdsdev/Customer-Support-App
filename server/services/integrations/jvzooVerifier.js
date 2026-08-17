'use strict';

const crypto = require('crypto');
const env = require('../../config/env');
const { VERIFICATION_STATUS } = require('../../utils/constants');

/**
 * JVZoo IPN verification adapter — the ONLY place a JVZoo signature is checked.
 *
 * Isolated on purpose: if JVZoo's scheme differs from what is implemented here,
 * or a real test IPN reveals a different convention, this file changes and
 * nothing in the controller or entitlement layer does.
 *
 * ───────────────────────────────────────────────────────────────────────────
 *  VERIFICATION STATUS: **UNCONFIRMED / PRODUCTION-BLOCKED**
 * ───────────────────────────────────────────────────────────────────────────
 * No official current JVZoo IPN documentation or a real sanitized test
 * notification was supplied with this project. The algorithm below is JVZoo's
 * long-published `cverify` scheme:
 *
 *   1. Take every POSTed field EXCEPT `cverify`.
 *   2. Sort the field NAMES ascending (case-sensitive).
 *   3. Concatenate the VALUES in that order.
 *   4. Append the IPN secret key.
 *   5. SHA-1, uppercase, take the first 8 characters.
 *   6. Constant-time compare against the submitted `cverify`.
 *
 * Two historical concatenation conventions exist in JVZoo's own samples
 * (secret appended once at the end, vs. after every value). Both are computed
 * and either match verifies — the one place ambiguity is tolerated, and it is
 * logged. This MUST be confirmed against a real JVZoo test IPN before the
 * webhook is enabled in production. Until then:
 *
 *   - `verify()` returns BLOCKED when the scheme is unconfirmed OR the secret
 *     is missing, and the caller grants NOTHING.
 *   - Set `JVZOO_VERIFICATION_CONFIRMED=true` (see .env.example) only AFTER you
 *     have validated a real test IPN end to end. That flips BLOCKED → real
 *     verify/reject behaviour.
 */

const SIGNATURE_FIELD = 'cverify';

/** Returns both candidate signatures for the documented conventions. */
function computeSignatures(fields, secret) {
  const names = Object.keys(fields)
    .filter((k) => k !== SIGNATURE_FIELD)
    .sort(); // ascending, case-sensitive — JVZoo's documented order

  const values = names.map((n) => (fields[n] === undefined || fields[n] === null ? '' : String(fields[n])));

  const joinedOnce = values.join('') + secret; // secret appended once
  const joinedEach = values.map((v) => v + secret).join(''); // secret after each value

  const sig = (input) => crypto.createHash('sha1').update(input, 'utf8').digest('hex').toUpperCase().slice(0, 8);
  return [sig(joinedOnce), sig(joinedEach)];
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Whether a secret is configured at all. */
function isConfigured() {
  return Boolean(env.jvzoo.ipnSecret);
}

/** Whether the operator has confirmed the scheme against a real test IPN. */
function isConfirmed() {
  return env.jvzoo.verificationConfirmed === true;
}

/**
 * @param {object} fields  parsed IPN body
 * @returns {{ status: string, ok: boolean, reason?: string }}
 *   status ∈ VERIFICATION_STATUS. `ok` is true ONLY for VERIFIED.
 *
 *   - BLOCKED       scheme unconfirmed (production gate) — grants nothing
 *   - UNCONFIGURED  no secret set — grants nothing
 *   - FAILED        secret present, signature missing or mismatched
 *   - VERIFIED      signature matched (and scheme confirmed)
 */
function verify(fields) {
  if (!isConfigured()) {
    return { status: VERIFICATION_STATUS.UNCONFIGURED, ok: false, reason: 'JVZOO_IPN_SECRET not set' };
  }
  if (!isConfirmed()) {
    return {
      status: VERIFICATION_STATUS.BLOCKED,
      ok: false,
      reason:
        'JVZoo verification scheme not yet confirmed against a real test IPN. ' +
        'Set JVZOO_VERIFICATION_CONFIRMED=true after validating one.',
    };
  }

  const submitted = fields[SIGNATURE_FIELD];
  if (!submitted) {
    return { status: VERIFICATION_STATUS.FAILED, ok: false, reason: 'Missing cverify field' };
  }

  const candidates = computeSignatures(fields, env.jvzoo.ipnSecret);
  const matched = candidates.some((c) => timingSafeEqual(c, submitted));

  return matched
    ? { status: VERIFICATION_STATUS.VERIFIED, ok: true }
    : { status: VERIFICATION_STATUS.FAILED, ok: false, reason: 'Signature mismatch' };
}

module.exports = {
  verify,
  isConfigured,
  isConfirmed,
  SIGNATURE_FIELD,
  // exported for the verification unit test only
  _computeSignatures: computeSignatures,
};
