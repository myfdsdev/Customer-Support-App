'use strict';

const crypto = require('crypto');
const { PAYMENT_EVENT_TYPES } = require('../../utils/constants');
const verifier = require('./jvzooVerifier');

/**
 * JVZoo protocol adapter (everything JVZoo-specific EXCEPT signature checking,
 * which lives in jvzooVerifier.js). Turns a raw IPN body into the internal
 * normalized event shape the entitlement layer consumes, and redacts payloads
 * for safe storage.
 *
 * NOTE: field names and event verbs below follow JVZoo's long-published IPN
 * format. They must be confirmed against a real test IPN before production —
 * see jvzooVerifier.js. If your account documents different names, change them
 * here; nothing downstream reads raw request fields.
 */

const SIGNATURE_FIELD = verifier.SIGNATURE_FIELD;

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
const SENSITIVE_FIELDS = new Set([SIGNATURE_FIELD, 'secretkey', 'ccustzip', 'ccuststate']);

/** Delegates to the isolated verifier. */
function verify(fields) {
  return verifier.verify(fields);
}

/**
 * Turns a raw JVZoo body into the provider-agnostic normalized shape the
 * entitlement service consumes. Never throws: a malformed body yields an
 * `unknown` event that is stored for audit but grants nothing.
 *
 * @returns normalized event:
 *   { provider, eventId, eventType, rawEventType, transactionId,
 *     parentTransactionId, externalProductId, customerEmail, customerName,
 *     amount, currency, occurredAt, verified }
 */
function normalize(body = {}, { verified = false } = {}) {
  const rawType = String(body.ctransaction || '').toUpperCase();
  const eventType = TRANSACTION_MAP[rawType] || PAYMENT_EVENT_TYPES.UNKNOWN;

  const transactionId = String(body.ctransreceipt || '').trim();
  const parentRaw = String(body.cupsellreceipt || '').trim();
  const parentTransactionId = parentRaw && parentRaw !== transactionId ? parentRaw : '';

  const productExternalId = String(body.cproditem || '').trim();

  const amountRaw = body.ctransamount ?? body.camount ?? '';
  const amount = Number(String(amountRaw).replace(/[^0-9.\-]/g, '')) || 0;

  // JVZoo does not send a dedicated event id, so derive a deterministic
  // composite of receipt + verb + product. A retry produces the same id and is
  // deduped by the unique index on PaymentEvent.
  const eventId = `jvzoo:${transactionId || 'na'}:${rawType || 'na'}:${productExternalId || 'na'}`;

  return {
    provider: 'jvzoo',
    eventId,
    eventType,
    rawEventType: rawType,
    transactionId,
    parentTransactionId,
    externalProductId: productExternalId,
    customerEmail: String(body.ccustemail || '').trim().toLowerCase(),
    customerName: String(body.ccustname || '').trim(),
    amount,
    currency: String(body.ccurrency || '').trim().toUpperCase(),
    occurredAt: new Date(),
    verified: Boolean(verified),
  };
}

/**
 * Strips secrets and the noisiest PII before the body is stored for debugging.
 * Keeps enough to investigate a bad purchase.
 */
function redactPayload(body = {}) {
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    if (SENSITIVE_FIELDS.has(k)) continue;
    if (/street|address|phone/i.test(k)) continue; // never store a full address/phone
    out[k] = typeof v === 'string' ? v.slice(0, 500) : v;
  }
  return out;
}

/** Tamper-evident fingerprint of the raw body — no secret, no PII exposure. */
function payloadHash(raw) {
  const input = typeof raw === 'string' ? raw : JSON.stringify(raw || {});
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

/** JVZoo expects a plain "1" acknowledgement on success. */
const ackBody = () => '1';

module.exports = {
  verify,
  normalize,
  redactPayload,
  payloadHash,
  ackBody,
  SIGNATURE_FIELD,
  // re-exported for the verification unit test
  _computeSignatures: verifier._computeSignatures,
};
