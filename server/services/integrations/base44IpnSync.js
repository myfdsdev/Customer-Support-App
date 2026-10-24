'use strict';

const env = require('../../config/env');
const logger = require('../../utils/logger');
const jvzooService = require('./jvzooService');
const entitlements = require('./entitlementService');
const { PaymentEvent } = require('../../models');

/**
 * Imports the JVZoo IPNs a Base44 app has stored (its `JvzooTransaction`
 * entity) into this platform.
 *
 * Each record's `raw_ipn_data` is the original IPN body, `cverify` included, so
 * it is run through exactly the same verify -> normalize -> ingestEvent path as
 * a live IPN. That means:
 *   - only records whose JVZoo signature checks out can grant access;
 *     anything else is stored for audit as a failed event, as with the webhook;
 *   - re-running the sync is safe: the composite event id is deduped by the
 *     unique index on PaymentEvent, the same way JVZoo retries are.
 */

const PAGE_SIZE = 100;
const USER_AGENT = 'base44-ipn-sync';

/** Fetches one page of records from the Base44 app's entity API. */
async function fetchPage({ skip, limit }) {
  const { apiUrl, appId, apiKey, entity } = env.base44;
  const url = new URL(`${apiUrl}/api/apps/${appId}/entities/${encodeURIComponent(entity)}`);
  url.searchParams.set('sort', 'created_date');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('skip', String(skip));

  const res = await fetch(url, {
    // Base44 personal access tokens are only accepted as a Bearer token.
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const text = (await res.text().catch(() => '')).slice(0, 200);
    throw new Error(`Base44 API ${res.status} on ${entity}: ${text}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : data.entities || data.items || [];
}

/** Reads every record from Base44, oldest first, up to `max`. */
async function fetchAllRecords({ max = Infinity } = {}) {
  if (!env.base44.configured) {
    throw new Error('Base44 sync is not configured: set BASE44_APP_ID and BASE44_API_KEY.');
  }
  const records = [];
  for (let skip = 0; records.length < max; skip += PAGE_SIZE) {
    const page = await fetchPage({ skip, limit: Math.min(PAGE_SIZE, max - records.length) });
    records.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return records;
}

/** JVZoo's `ctranstime` is unix seconds; fall back to Base44's own timestamp. */
function purchaseTime(raw, record) {
  const secs = Number(raw.ctranstime);
  if (Number.isFinite(secs) && secs > 0) return new Date(secs * 1000);
  const created = record.created_date ? new Date(`${record.created_date}Z`.replace(/ZZ$/, 'Z')) : null;
  return created && !Number.isNaN(created.getTime()) ? created : new Date();
}

/**
 * Runs records through the IPN pipeline. With `dryRun` nothing is written:
 * each record is only verified and normalized, so you can see what a real run
 * would do first.
 *
 * @returns {{ total, imported, duplicates, granted, revoked, pendingMapping, unverified, skipped, results }}
 */
async function importRecords(records, { dryRun = false } = {}) {
  const summary = {
    total: records.length,
    imported: 0,
    duplicates: 0,
    granted: 0,
    revoked: 0,
    pendingMapping: 0,
    unverified: 0,
    skipped: 0,
    results: [],
  };

  // The duplicate guard is the unique index on PaymentEvent; make sure it is
  // built before inserting, or a fresh database would accept repeats.
  if (!dryRun) await PaymentEvent.init();

  for (const record of records) {
    const raw = record.raw_ipn_data && typeof record.raw_ipn_data === 'object' ? record.raw_ipn_data : null;
    if (!raw || !raw.ctransreceipt) {
      summary.skipped += 1;
      summary.results.push({ id: record.id, outcome: 'skipped', reason: 'no raw IPN data' });
      continue;
    }

    // Base44 stores every value as a string already; coerce defensively so the
    // signature is computed over the same text JVZoo signed.
    const body = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v == null ? '' : String(v)]));
    const verification = jvzooService.verify(body);
    const normalized = jvzooService.normalize(body, { verified: verification.ok });
    if (!verification.ok) summary.unverified += 1;

    const row = {
      id: record.id,
      receipt: normalized.transactionId,
      type: normalized.rawEventType,
      verification: verification.status,
    };

    if (dryRun) {
      summary.results.push({ ...row, outcome: verification.ok ? 'would_import' : 'would_store_unverified' });
      continue;
    }

    const { duplicate, result } = await entitlements.ingestEvent({
      normalized,
      verification,
      redactedPayload: jvzooService.redactPayload(body),
      payloadHash: jvzooService.payloadHash(body),
      requestMeta: { ipHash: '', userAgent: USER_AGENT },
      receivedAt: purchaseTime(body, record),
    });

    if (duplicate) {
      summary.duplicates += 1;
      summary.results.push({ ...row, outcome: 'duplicate' });
      continue;
    }
    summary.imported += 1;
    if (result && result.outcome === 'granted') summary.granted += 1;
    if (result && result.outcome === 'revoked') summary.revoked += 1;
    if (result && result.outcome === 'pending_mapping') summary.pendingMapping += 1;
    summary.results.push({ ...row, outcome: result ? result.outcome : 'stored_unverified', reason: result && result.reason });
  }

  return summary;
}

/** Fetch from Base44 and import, in one call. */
async function syncFromBase44({ dryRun = false, max } = {}) {
  const records = await fetchAllRecords({ max });
  const summary = await importRecords(records, { dryRun });
  logger.info(
    `Base44 IPN sync${dryRun ? ' (dry run)' : ''}: ${summary.total} records, ${summary.imported} imported, ` +
      `${summary.duplicates} already present, ${summary.granted} granted, ${summary.pendingMapping} awaiting product mapping, ` +
      `${summary.unverified} unverified, ${summary.skipped} skipped.`
  );
  return summary;
}

let timer = null;

/** Starts the periodic sync when BASE44_SYNC_INTERVAL_MINUTES > 0. */
function startScheduler() {
  const minutes = env.base44.intervalMinutes;
  if (!minutes || minutes <= 0 || timer) return;
  if (!env.base44.configured) {
    logger.warn('BASE44_SYNC_INTERVAL_MINUTES is set but BASE44_APP_ID/BASE44_API_KEY are missing — sync disabled.');
    return;
  }
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await syncFromBase44();
    } catch (err) {
      logger.error('Base44 IPN sync failed:', err.message);
    } finally {
      running = false;
    }
  };
  timer = setInterval(tick, minutes * 60 * 1000);
  timer.unref();
  logger.info(`Base44 IPN sync scheduled every ${minutes} min.`);
  tick();
}

module.exports = { fetchAllRecords, importRecords, syncFromBase44, startScheduler };
