'use strict';

const http = require('http');
const env = require('./config/env');
const logger = require('./utils/logger');
const { connectDB, disconnectDB } = require('./config/db');
const app = require('./app');
const { initSockets } = require('./sockets');
const gemini = require('./services/gemini');
const mail = require('./services/mail');

async function start() {
  await connectDB();

  const server = http.createServer(app);
  initSockets(server);

  server.listen(env.port, () => {
    logger.info(`API listening on http://localhost:${env.port}`);
    logger.info(`CORS origin: ${env.clientUrl}`);
    if (gemini.isEnabled()) {
      logger.info(`Gemini enabled (${gemini.modelName()})`);
    } else {
      logger.warn('GEMINI_API_KEY is not set — running with keyword retrieval and extractive answers.');
    }
    if (mail.isEnabled()) {
      logger.info(`Mail enabled (Resend, from ${env.mail.from})`);
    } else {
      logger.warn('RESEND_API_KEY/MAIL_FROM not set — transactional emails will be logged, not sent.');
    }
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down.`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    // Do not hang forever on lingering sockets.
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (err) => logger.error('Unhandled rejection:', err));
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception:', err);
    process.exit(1);
  });
}

start().catch((err) => {
  logger.error('Failed to start server:', err.message);
  process.exit(1);
});
