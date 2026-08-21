'use strict';

/* eslint-disable no-console */
/**
 * Ingest knowledge (and optional training videos) from JSON files into the
 * product-scoped knowledge base, so the AI answers from them immediately.
 *
 * Usage:
 *   node scripts/importKnowledge.js                    # imports every *.json in ./knowledge-imports
 *   node scripts/importKnowledge.js path/to/file.json  # imports one file
 *   node scripts/importKnowledge.js --product videoclawbot path/to/file.json
 *
 * or via npm:
 *   npm run import:kb                     (whole folder)
 *   npm run import:kb -- data/kb.json     (one file)
 *
 * JSON shape (all fields except title/content optional):
 *   {
 *     "product": "videoclawbot",
 *     "knowledge": [
 *       { "title": "How do I reset my password?", "category": "Login",
 *         "content": "Go to Settings → Security …", "keywords": ["password","reset"] }
 *     ],
 *     "videos": [
 *       { "title": "Getting started", "videoUrl": "https://…", "category": "Tutorial" }
 *     ]
 *   }
 *
 * A bare array of articles is also accepted; then pass --product or name the
 * file <slug>.json so the importer knows which product it belongs to.
 *
 * Idempotent: re-running the same file updates items in place (matched by
 * title) instead of duplicating them.
 */

const fs = require('fs');
const path = require('path');

const IMPORT_DIR = path.join(__dirname, '..', 'knowledge-imports');

function parseArgs(argv) {
  const args = { product: '', files: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--product' || argv[i] === '-p') {
      args.product = argv[i + 1] || '';
      i += 1;
    } else {
      args.files.push(argv[i]);
    }
  }
  return args;
}

function collectFiles(explicit) {
  if (explicit.length) return explicit.map((f) => path.resolve(f));
  if (!fs.existsSync(IMPORT_DIR)) return [];
  return fs
    .readdirSync(IMPORT_DIR)
    .filter((f) => f.toLowerCase().endsWith('.json'))
    // Skip the bundled sample and any file the operator parks with a leading _.
    .filter((f) => !/^(example\.|_)/i.test(f))
    .map((f) => path.join(IMPORT_DIR, f));
}

async function main() {
  const { product: productFlag, files: fileArgs } = parseArgs(process.argv.slice(2));

  const { connectDB, disconnectDB } = require('../config/db');
  const importer = require('../services/knowledge/jsonImporter');

  const files = collectFiles(fileArgs);
  if (!files.length) {
    console.log(`No JSON files found. Drop files into ${IMPORT_DIR} or pass a path.`);
    console.log('Example:  npm run import:kb -- ./knowledge-imports/videoclawbot.json');
    process.exit(0);
  }

  await connectDB();

  const totals = { files: 0, kbCreated: 0, kbUpdated: 0, kbFailed: 0, chunks: 0, vidCreated: 0, vidUpdated: 0 };

  for (const file of files) {
    let json;
    try {
      json = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      console.error(`✗ ${path.basename(file)}: invalid JSON — ${err.message}`);
      continue;
    }
    // File name (minus .json) is the product hint fallback, e.g. videoclawbot.json.
    const fallbackProduct = productFlag || path.basename(file).replace(/\.json$/i, '');
    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await importer.importFromObject(json, { productHint: fallbackProduct });
      totals.files += 1;
      totals.kbCreated += res.knowledge.created;
      totals.kbUpdated += res.knowledge.updated;
      totals.kbFailed += res.knowledge.failed;
      totals.chunks += res.knowledge.chunks;
      totals.vidCreated += res.videos.created;
      totals.vidUpdated += res.videos.updated;
      console.log(
        `✓ ${path.basename(file)} → ${res.product.name}: ` +
          `${res.knowledge.created} new / ${res.knowledge.updated} updated articles ` +
          `(${res.knowledge.chunks} chunks), ${res.videos.created + res.videos.updated} videos` +
          (res.errors.length ? `  [${res.errors.length} warning(s)]` : '')
      );
      res.errors.slice(0, 10).forEach((e) => console.log(`    · ${e}`));
    } catch (err) {
      console.error(`✗ ${path.basename(file)}: ${err.message}`);
    }
  }

  console.log(
    `\nDone. ${totals.files} file(s) · articles +${totals.kbCreated}/${totals.kbUpdated} ` +
      `(${totals.chunks} chunks) · videos +${totals.vidCreated}/${totals.vidUpdated}` +
      (totals.kbFailed ? ` · ${totals.kbFailed} skipped` : '')
  );

  const embeddings = require('../services/gemini/embeddings');
  if (!embeddings.isEnabled()) {
    console.log(
      '\nNote: GEMINI_API_KEY is not set, so semantic embeddings were skipped. Keyword search still works; ' +
        'set the key and re-run (or `npm run reindex`) for full semantic retrieval.'
    );
  }

  await disconnectDB();
  process.exit(0);
}

main().catch((err) => {
  console.error('[import:kb] failed:', err);
  process.exit(1);
});
