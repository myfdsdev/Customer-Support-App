'use strict';

/* eslint-disable no-console */
/**
 * Validates our JVZoo signature scheme against REAL captured IPNs — offline.
 *
 * The verifier ships with an explicit warning that its `cverify` algorithm was
 * never confirmed against a genuine notification. This is how you confirm it,
 * without pointing live traffic at an endpoint that might reject every sale.
 *
 * Give it a JSON file of real IPN payloads (each one must still carry its own
 * `cverify`), and it recomputes the signature for each and compares. If they
 * match, the scheme is right and JVZOO_VERIFICATION_CONFIRMED=true is safe.
 *
 *   node scripts/checkJvzooSignature.js payloads.json
 *
 * The secret is read from server/.env (which is gitignored) or from the
 * environment. Passing it on the command line would put it in shell history, so
 * that is deliberately not the documented route. It is never printed, logged or
 * written anywhere by this script.
 *
 * The file may be a single payload object, an array of them, or an object whose
 * values are payloads.
 */

const fs = require('fs');
const path = require('path');

// Loads server/.env so the secret can live in the same place the server reads
// it from, rather than being typed into a terminal.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Deliberately delegates to the shipped verifier rather than reimplementing the
// algorithm. A private copy here could drift from the code that actually runs,
// and would then happily confirm a scheme production does not use.
const { SIGNATURE_FIELD, _computeSignatures: computeSignatures } = require('../services/integrations/jvzooVerifier');

function collectPayloads(json) {
  if (Array.isArray(json)) return json;
  if (json && typeof json === 'object') {
    if (json[SIGNATURE_FIELD]) return [json];
    return Object.values(json).filter((v) => v && typeof v === 'object');
  }
  return [];
}

function main() {
  const secret = process.env.JVZOO_IPN_SECRET || '';
  const file = process.argv[2];

  if (!secret) {
    console.error(
      'JVZOO_IPN_SECRET is not set.\n' +
        'Add this line to server/.env (it is gitignored), then run again:\n' +
        '  JVZOO_IPN_SECRET=your_secret_from_the_jvzoo_dashboard'
    );
    process.exit(1);
  }
  if (!file) {
    console.error('Usage: node scripts/checkJvzooSignature.js <payloads.json>');
    process.exit(1);
  }

  const payloads = collectPayloads(JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')));
  if (!payloads.length) {
    console.error('No payloads found in that file.');
    process.exit(1);
  }

  console.log(`\nChecking ${payloads.length} captured IPN(s) against the shipped scheme.\n`);

  let matched = 0;
  let skipped = 0;
  const conventions = new Set();

  payloads.forEach((payload, i) => {
    const submitted = payload[SIGNATURE_FIELD];
    const label = payload.ctransreceipt || `payload #${i + 1}`;

    if (!submitted) {
      skipped += 1;
      console.log(`  --  ${label}: no cverify on this payload, cannot check`);
      return;
    }

    const candidates = computeSignatures(payload, secret);
    const hit = String(submitted).toUpperCase();

    if (candidates.includes(hit)) {
      matched += 1;
      conventions.add('shipped scheme');
      console.log(`  OK  ${label}`);
    } else {
      // Both values are printed on purpose — seeing ours next to JVZoo's is the
      // whole point when a mismatch has to be diagnosed.
      console.log(`  XX  ${label}  expected ${hit}, computed ${candidates.join(' / ')}`);
    }
  });

  const checked = payloads.length - skipped;
  console.log(`\n${matched}/${checked} matched${skipped ? ` (${skipped} skipped)` : ''}`);

  if (checked && matched === checked) {
    console.log(`Scheme CONFIRMED using: ${[...conventions].join(', ')}`);
    console.log('JVZOO_VERIFICATION_CONFIRMED=true is safe to keep on.');
    process.exit(0);
  }

  console.log('Scheme NOT confirmed. Do NOT point live JVZoo traffic at this endpoint yet —');
  console.log('every notification would fail verification and grant nothing.');
  process.exit(1);
}

main();
