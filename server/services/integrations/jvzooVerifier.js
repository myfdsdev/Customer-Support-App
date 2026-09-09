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
 *  VERIFICATION STATUS: **CONFIRMED against real JVZoo notifications**
 * ───────────────────────────────────────────────────────────────────────────
 * Validated on 2026-09-09 against three genuine Cinema Studio sale IPNs, using
 * scripts/checkJvzooSignature.js. All three matched this construction:
 *
 *   1. Take every POSTed field EXCEPT `cverify`.
 *   2. Sort the field NAMES ascending (case-sensitive).
 *   3. Concatenate each VALUE in that order, FOLLOWED BY a "|" separator —
 *      including a trailing one after the last value.
 *   4. Append the IPN secret key.
 *   5. SHA-1, uppercase, take the first 8 characters.
 *   6. Constant-time compare against the submitted `cverify`.
 *
 * i.e.  sha1("value1|value2|…|valueN|" + secret)
 *
 * The pipe separators are the whole ballgame. An earlier version concatenated
 * the values with nothing between them, which is a plausible reading of the
 * same documentation and fails EVERY real notification — silently, because a
 * failed signature looks identical to an attack.
 *
 * The production gate remains, because a confirmed algorithm is not the same as
 * a correctly configured deployment (wrong secret, wrong account):
 *
 *   - `verify()` returns BLOCKED when JVZOO_VERIFICATION_CONFIRMED is not set,
 *     and the caller grants NOTHING.
 *   - Before flipping it on for a new deployment, re-run
 *     scripts/checkJvzooSignature.js against a real captured IPN. It compares
 *     offline, so nothing has to be pointed at live traffic to find out.
 */

const SIGNATURE_FIELD = 'cverify';

/**
 * The confirmed signature for a payload.
 *
 * Returns an ARRAY so callers stay unchanged from when two conventions were in
 * play; there is now exactly one, and any future ambiguity has somewhere to go.
 */
function computeSignatures(fields, secret) {
  const names = Object.keys(fields)
    .filter((k) => k !== SIGNATURE_FIELD)
    .sort(); // ascending, case-sensitive — JVZoo's documented order

  const values = names.map((n) => (fields[n] === undefined || fields[n] === null ? '' : String(fields[n])));

  // Every value carries its own trailing "|", so the string ends with one
  // before the secret is appended. Verified against real notifications.
  const payload = values.map((v) => `${v}|`).join('') + secret;

  const sig = (input) => crypto.createHash('sha1').update(input, 'utf8').digest('hex').toUpperCase().slice(0, 8);
  return [sig(payload)];
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
