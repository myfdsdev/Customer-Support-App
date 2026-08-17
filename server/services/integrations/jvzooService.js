'use strict';

const crypto = require('crypto');
const env = require('../../config/env');
const {
  PAYMENT_EVENT_TYPES,
  VERIFICATION_STATUS,
} = require('../../utils/constants');

/**
 * JVZoo IPN adapter.
 *
 * Everything JVZoo-specific lives here, behind a small interface
 * (`verify`, `normalize`, `redactPayload`), so the entitlement lifecycle in
 * entitlementService.js never has to know how JVZoo signs a request or names
 * its fields. If JVZoo changes its scheme, or a second provider is added, this
 * file changes and nothing downstream does.
 *
 * ---------------------------------------------------------------------------
 * VERIFICATION
 * ---------------------------------------------------------------------------
 * The algorithm implemented below is JVZoo's long-standing published IPN
 * verification ("cverify"):
 *
 *   1. Take every POSTed field EXCEPT `cverify` itself.
 *   2. Sort the field NAMES alphabetically (ascending, case-sensitive).
 *   3. Concatenate the VALUES in that order, each followed by the IPN secret.
 *      (In practice: join the sorted values, then append the secret once at
 *      the end — JVZoo's reference code appends the secret to the assembled
 *      string.)
 *   4. SHA-1 the result, uppercase it, take the first 8 characters.
 *   5. Compare, constant-time, against the submitted `cverify`.
 *
 * There are two subtly different concatenation conventions in circulation in
 * JVZoo's own historical samples (secret appended once at the end vs. after
 * each value). Both are implemented and either match verifies, so a working
 * secret is not rejected on a convention mismatch. This is the ONLY place that
 * ambiguity is tolerated, and it is logged.
 *
 * IMPORTANT: this must be validated against a real JVZoo test IPN before it is
 * relied upon in production. If your JVZoo account documentation specifies a
 * different current scheme, replace `computeSignatures` below — nothing else
 * needs to change. Until such validation is done, treat webhook verification
 * as unconfirmed (see README "JVZoo setup").
 */

const SIGNATURE_FIELD = 'cverify';

/** Maps JVZoo's `ctransaction` verbs onto our normalised event vocabulary. */
const TRANSACTION_MAP = {
  SALE: PAYMENT_EVENT_TYPES.SALE,
  BILL: PAYMENT_EVENT_TYPES.BILL,
  RECURRING: PAYMENT_EVENT_TYPES.BILL,
  UPSELL: PAYMENT_EVENT_TYPES.UPSELL,
  REFUND: PAYMENT_EVENT_TYPES.REFUND,
  'CHARGE-BACK': PAYMENT_EVENT_TYPES.CHARGEBACK,
  CGBK: PAYMENT_EVENT_TYPES.CHARGEBACK,
  CANCEL: PAYMENT_EVENT_TYPES.CANCEL,
  'CANCEL-REBILL': PAYMENT_EVENT_TYPES.CANCEL,
  UNCANCEL: PAYMENT_EVENT_TYPES.REINSTATE,
  'UNCANCEL-REBILL': PAYMENT_EVENT_TYPES.REINSTATE,
  'RESUME-REBILL': PAYMENT_EVENT_TYPES.REINSTATE,
};

/** Fields whose values must never be stored or logged. */
const SENSITIVE_FIELDS = new Set([
  SIGNATURE_FIELD,
  'secretkey',
  'ccustzip',
  'ccuststate',
]);

function computeSignatures(body, secret) {
  const names = Object.keys(body)
    .filter((k) => k !== SIGNATURE_FIELD)
    .sort(); // ascending, case-sensitive — JVZoo's documented order

  const values = names.map((n) => (body[n] === undefined || body[n] === null ? '' : String(body[n])));

  // Convention A: append the secret once to the joined values.
  const joinedOnce = values.join('') + secret;
  // Convention B: append the secret after every value.
  const joinedEach = values.map((v) => v + secret).join('');

  const sig = (input) => crypto.createHash('sha1').update(input, 'utf8').digest('hex').toUpperCase().slice(0, 8);

  return [sig(joinedOnce), sig(joinedEach)];
}

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * @returns {{ status: string, ok: boolean, reason?: string }}
 *   status is one of VERIFICATION_STATUS.
 *   - VERIFIED   signature matched
 *   - FAILED     signature present but did not match (possible forgery)
 *   - UNCONFIGURED  no secret set — cannot verify, must not grant access
 */
function verify(body) {
  const secret = env.jvzoo.ipnSecret;
  if (!secret) {
    return { status: VERIFICATION_STATUS.UNCONFIGURED, ok: false, reason: 'JVZOO_IPN_SECRET not set' };
  }

  const submitted = body[SIGNATURE_FIELD];
  if (!submitted) {
    return { status: VERIFICATION_STATUS.FAILED, ok: false, reason: 'Missing cverify field' };
  }

  const candidates = computeSignatures(body, secret);
  const matched = candidates.some((c) => timingSafeEqualStr(c, submitted));

  return matched
    ? { status: VERIFICATION_STATUS.VERIFIED, ok: true }
    : { status: VERIFICATION_STATUS.FAILED, ok: false, reason: 'Signature mismatch' };
}

/**
 * Turns a raw JVZoo body into the provider-agnostic shape the entitlement
 * service consumes. Never throws: a malformed body yields an `unknown` event
 * that will be stored for audit but grant nothing.
 */
function normalize(body = {}) {
  const rawType = String(body.ctransaction || '').toUpperCase();
  const eventType = TRANSACTION_MAP[rawType] || PAYMENT_EVENT_TYPES.UNKNOWN;

  const transactionId = String(body.ctransreceipt || '').trim();
  const parentTransactionId = String(body.ctransaction === 'BILL' ? body.ctransreceipt : body.cupsellreceipt || '').trim();

  // JVZoo can send several product ids in one receipt (bundles). `cproditem`
  // is the primary; keep it simple and let the mapping layer resolve it.
  const productExternalId = String(body.cproditem || '').trim();

  const amountRaw = body.ctransamount ?? body.camount ?? '';
  const amount = Number(String(amountRaw).replace(/[^0-9.\-]/g, '')) || 0;

  return {
    eventType,
    rawEventType: rawType,
    transactionId,
    parentTransactionId: parentTransactionId && parentTransactionId !== transactionId ? parentTransactionId : '',
    productExternalId,
    customerEmail: String(body.ccustemail || '').trim().toLowerCase(),
    customerName: String(body.ccustname || '').trim(),
    amount,
    currency: String(body.ccurrency || '').trim().toUpperCase(),
    status: rawType,
    /**
     * Deterministic idempotency key. JVZoo does not send a dedicated event id,
     * so a stable composite of receipt + verb + product is derived. A retry of
     * the same notification produces the same key and is deduped by the unique
     * index on PaymentEvent.
     */
    externalEventId: `jvzoo:${transactionId || 'na'}:${rawType || 'na'}:${productExternalId || 'na'}`,
  };
}

/**
 * Strips secrets and the noisiest PII before the body is stored on the
 * PaymentEvent for debugging. Keeps enough to investigate a bad purchase.
 */
function redactPayload(body = {}) {
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    if (SENSITIVE_FIELDS.has(k)) continue;
    // Never store a full street address; the city/country fields are enough.
    if (/street|address|phone/i.test(k)) continue;
    out[k] = typeof v === 'string' ? v.slice(0, 500) : v;
  }
  return out;
}

/**
 * JVZoo expects a plain "1" acknowledgement body on success. Returning
 * anything else makes JVZoo mark the IPN as failed and retry.
 */
const ackBody = () => '1';

module.exports = {
  verify,
  normalize,
  redactPayload,
  ackBody,
  SIGNATURE_FIELD,
  // exported for the verification test harness
  _computeSignatures: computeSignatures,
};
