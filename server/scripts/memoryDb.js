'use strict';

/**
 * Runs the whole API against a throwaway in-process MongoDB.
 *
 * Purpose: let someone start the platform end to end before they have MongoDB
 * installed or an Atlas cluster provisioned. Data lives in memory and is gone
 * on exit — never use this for anything you want to keep.
 *
 *   npm run dev:memory
 *
 * Atlas Vector Search does not exist here, so retrieval uses the in-process
 * cosine fallback (or keyword search with no Gemini key) — the same fallback
 * path the RAG layer is built around.
 */

const { MongoMemoryServer } = require('mongodb-memory-server');

async function main() {
  const mongod = await MongoMemoryServer.create({ instance: { dbName: 'support_platform' } });
  const uri = mongod.getUri();

  // Set before config/env is first required. dotenv does not override values
  // that already exist in process.env, so this wins over .env.
  process.env.MONGODB_URI = uri;
  process.env.ATLAS_VECTOR_SEARCH = 'false';

  // eslint-disable-next-line global-require
  const logger = require('../utils/logger');
  logger.warn('Using an IN-MEMORY MongoDB. All data is discarded when this process exits.');
  logger.info(`  ${uri}`);

  // eslint-disable-next-line global-require
  const { run: seed } = require('../seed/seed');
  await seed({ keepConnection: true });

  // eslint-disable-next-line global-require
  require('../server');

  const stop = async () => {
    await mongod.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[memory-db] failed to start:', err);
  process.exit(1);
});
