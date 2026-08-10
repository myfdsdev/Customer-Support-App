'use strict';

const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

mongoose.set('strictQuery', true);

let connected = false;

async function connectDB() {
  if (connected) return mongoose.connection;

  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('error', (err) => logger.error('MongoDB error:', err.message));
  mongoose.connection.on('disconnected', () => {
    connected = false;
    logger.warn('MongoDB disconnected');
  });

  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 15000,
    maxPoolSize: 20,
  });

  connected = true;
  await syncIndexes();
  return mongoose.connection;
}

/**
 * Reconciles the indexes actually present in MongoDB with the ones the schemas
 * declare, dropping any that no longer exist in code.
 *
 * This matters because a redefined index is NOT updated by `ensureIndexes` —
 * the old one simply stays. A database created before `Customer.email` became
 * a partial index would keep the broken sparse `email_1`, and every anonymous
 * visitor after the first would fail to be created.
 *
 * Never fatal: a permissions-restricted user should still be able to boot.
 */
async function syncIndexes() {
  const results = await Promise.allSettled(
    Object.values(mongoose.models).map(async (model) => {
      const dropped = await model.syncIndexes();
      return { model: model.modelName, dropped };
    })
  );

  const changed = results
    .filter((r) => r.status === 'fulfilled' && r.value.dropped?.length)
    .map((r) => `${r.value.model}: dropped ${r.value.dropped.join(', ')}`);
  if (changed.length) logger.info(`Index sync — ${changed.join(' | ')}`);

  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length) {
    logger.warn(`Index sync skipped for ${failed.length} model(s): ${failed[0].reason?.message}`);
  }
}

async function disconnectDB() {
  if (!connected) return;
  await mongoose.disconnect();
  connected = false;
}

/** True when the deployment is MongoDB Atlas (needed for $vectorSearch). */
function isAtlas() {
  return /mongodb\+srv|\.mongodb\.net/i.test(env.mongoUri);
}

module.exports = { connectDB, disconnectDB, syncIndexes, isAtlas, mongoose };
