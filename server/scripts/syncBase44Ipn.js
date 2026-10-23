'use strict';

/**
 * Imports JVZoo IPNs stored in a Base44 app (JvzooTransaction) into this
 * platform. Safe to re-run: already-imported events are skipped.
 *
 *   npm run sync:base44                      # import everything
 *   npm run sync:base44 -- --dry-run         # verify only, write nothing
 *   npm run sync:base44 -- --max 50          # first 50 records (oldest first)
 *   npm run sync:base44 -- --file recs.json  # import from an exported JSON
 *                                            # array instead of the Base44 API
 */

const fs = require('fs');
const { connectDB, disconnectDB } = require('../config/db');
const sync = require('../services/integrations/base44IpnSync');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const max = arg('--max') ? Number(arg('--max')) : undefined;
  const file = arg('--file');

  let summary;
  if (file) {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const records = Array.isArray(parsed) ? parsed : parsed.entities || [];
    if (!dryRun) await connectDB();
    summary = await sync.importRecords(max ? records.slice(0, max) : records, { dryRun });
  } else {
    if (!dryRun) await connectDB();
    summary = await sync.syncFromBase44({ dryRun, max });
  }

  const { results, ...totals } = summary;
  console.table(results);
  console.log(totals);
}

main()
  .catch((err) => {
    console.error('Sync failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
