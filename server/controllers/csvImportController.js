'use strict';

const fs = require('fs');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { hashIp } = require('../utils/tokens');
const { parseCsv } = require('../utils/csv');
const entitlements = require('../services/integrations/entitlementService');
const { Product, CustomerProduct, AuditLog } = require('../models');
const { PAYMENT_PROVIDERS, PURCHASE_STATUS, PAYMENT_EVENT_TYPES } = require('../utils/constants');

/**
 * Secure CSV import of historical purchases.
 *
 * A two-step flow: POST the file with `preview=true` to validate and see the
 * parsed rows, then POST again (or confirm) with the same mapping to commit.
 * Everything lands in the central CustomerProduct table — no per-CSV
 * collection is ever created.
 *
 * The uploaded file is parsed and immediately deleted; nothing is retained on
 * disk beyond the request.
 */

const STATUS_ALIASES = {
  active: PURCHASE_STATUS.ACTIVE,
  sale: PURCHASE_STATUS.ACTIVE,
  completed: PURCHASE_STATUS.ACTIVE,
  paid: PURCHASE_STATUS.ACTIVE,
  refund: PURCHASE_STATUS.REFUNDED,
  refunded: PURCHASE_STATUS.REFUNDED,
  chargeback: PURCHASE_STATUS.CHARGEBACK,
  cancelled: PURCHASE_STATUS.CANCELLED,
  canceled: PURCHASE_STATUS.CANCELLED,
};

function readUploadedCsv(req) {
  if (!req.file) throw ApiError.badRequest('No CSV file received');
  try {
    const text = fs.readFileSync(req.file.path, 'utf8');
    return parseCsv(text);
  } finally {
    fs.unlink(req.file.path, () => {}); // never keep the raw purchase export on disk
  }
}

/**
 * Turns one CSV row into a validated purchase record using the admin's column
 * mapping. Returns { ok, record?, error? }.
 */
function mapRow(row, mapping) {
  const get = (key) => (mapping[key] ? String(row[mapping[key]] ?? '').trim() : '');

  const email = get('email').toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'missing or invalid email' };
  }

  const statusRaw = (get('status') || 'active').toLowerCase();
  const purchaseStatus = STATUS_ALIASES[statusRaw] || PURCHASE_STATUS.ACTIVE;

  const dateRaw = get('purchaseDate');
  let purchaseDate = null;
  if (dateRaw) {
    const parsed = new Date(dateRaw);
    if (!Number.isNaN(parsed.getTime())) purchaseDate = parsed;
  }

  return {
    ok: true,
    record: {
      email,
      name: get('name'),
      transactionId: get('transactionId'),
      externalProductId: get('productId'),
      plan: get('plan'),
      purchaseStatus,
      purchaseDate,
    },
  };
}

/**
 * POST /api/integrations/jvzoo/import   (multipart: file + fields)
 * Body: productId (internal), mapping (JSON of {csvColumn} per field), commit=true|false
 */
const importCsv = asyncHandler(async (req, res) => {
  const productId = req.body.productId;
  if (!productId) throw ApiError.badRequest('Select the internal product to import into');

  const product = await Product.findById(productId);
  if (!product) throw ApiError.notFound('Product not found');

  let mapping;
  try {
    mapping = typeof req.body.mapping === 'string' ? JSON.parse(req.body.mapping) : req.body.mapping || {};
  } catch {
    throw ApiError.badRequest('Column mapping is not valid JSON');
  }
  if (!mapping.email) throw ApiError.badRequest('The email column must be mapped');

  const { headers, rows } = readUploadedCsv(req);
  if (!rows.length) throw ApiError.badRequest('The CSV had no data rows');
  if (rows.length > 20000) throw ApiError.badRequest('CSV too large (max 20,000 rows per import)');

  const commit = req.body.commit === 'true' || req.body.commit === true;

  const valid = [];
  const invalid = [];
  rows.forEach((row, idx) => {
    const mapped = mapRow(row, mapping);
    if (mapped.ok) valid.push(mapped.record);
    else invalid.push({ row: idx + 2, error: mapped.error, data: row }); // +2: header + 1-index
  });

  // Preview mode: validate and return, touch nothing.
  if (!commit) {
    return res.json({
      success: true,
      data: {
        mode: 'preview',
        headers,
        totalRows: rows.length,
        validCount: valid.length,
        invalidCount: invalid.length,
        sample: valid.slice(0, 10),
        invalid: invalid.slice(0, 50),
      },
    });
  }

  // Commit mode: upsert idempotently into the central entitlement table.
  const totals = { created: 0, updated: 0, skipped: 0, failed: 0 };
  const failures = [];

  for (let i = 0; i < valid.length; i += 1) {
    const record = valid[i];
    try {
      // eslint-disable-next-line no-await-in-loop
      const customer = await entitlements.findOrCreateCustomerByEmail({ email: record.email, name: record.name });
      if (!customer) {
        totals.failed += 1;
        failures.push({ email: record.email, error: 'could not resolve customer' });
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const existing = await CustomerProduct.findOne({ customerId: customer._id, productId: product._id });

      const isRevoked = record.purchaseStatus !== PURCHASE_STATUS.ACTIVE;
      const set = {
        provider: PAYMENT_PROVIDERS.CSV,
        verified: true,
        verifiedSource: 'csv_import',
        lastVerifiedAt: new Date(),
        purchaseStatus: record.purchaseStatus,
        subscriptionStatus: isRevoked ? 'refunded' : 'active',
        externalProductId: record.externalProductId || '',
        lastEventType: isRevoked ? PAYMENT_EVENT_TYPES.REFUND : PAYMENT_EVENT_TYPES.SALE,
      };
      if (record.transactionId) {
        set.transactionId = record.transactionId;
        set.orderId = record.transactionId;
      }
      if (record.plan) set.plan = record.plan;
      if (isRevoked) set.accessRevokedAt = new Date();
      else set.accessGrantedAt = new Date();

      // eslint-disable-next-line no-await-in-loop
      await CustomerProduct.findOneAndUpdate(
        { customerId: customer._id, productId: product._id },
        {
          $set: set,
          $setOnInsert: { purchaseDate: record.purchaseDate || new Date() },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      if (existing) totals.updated += 1;
      else totals.created += 1;
    } catch (err) {
      totals.failed += 1;
      failures.push({ email: record.email, error: err.message });
    }
  }
  totals.skipped = invalid.length;

  await AuditLog.record({
    actorId: req.user._id,
    actorName: req.user.name,
    actorRole: req.user.role,
    action: 'jvzoo.csv.import',
    targetType: 'product',
    targetId: product._id,
    summary: `CSV import into ${product.name}: +${totals.created} new, ${totals.updated} updated, ${totals.failed} failed`,
    meta: totals,
    ipHash: hashIp(req.ip),
  });

  res.json({
    success: true,
    data: {
      mode: 'commit',
      product: { _id: product._id, name: product.name },
      totals,
      invalid: invalid.slice(0, 100),
      failures: failures.slice(0, 100),
    },
  });
});

module.exports = { importCsv };
