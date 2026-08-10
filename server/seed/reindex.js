'use strict';

const logger = require('../utils/logger');
const { connectDB, disconnectDB } = require('../config/db');
const rag = require('../services/rag');
const gemini = require('../services/gemini');

/**
 * Rebuilds chunks + embeddings for every knowledge item and training video.
 * Run this after adding a GEMINI_API_KEY to upgrade an existing keyword-only
 * install to semantic retrieval without touching any content.
 */
async function run() {
  await connectDB();
  logger.info(gemini.isEnabled() ? `Reindexing with embeddings (${gemini.embeddings.modelName()})` : 'Reindexing without embeddings (no GEMINI_API_KEY)');

  const result = await rag.reindexAll();
  logger.info(`Reindexed ${result.items} knowledge items into ${result.chunks} chunks, ${result.videos} videos.`);

  await disconnectDB();
}

run().catch(async (err) => {
  logger.error('Reindex failed:', err);
  await disconnectDB();
  process.exit(1);
});
