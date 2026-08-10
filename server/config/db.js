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
  return mongoose.connection;
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

module.exports = { connectDB, disconnectDB, isAtlas, mongoose };
