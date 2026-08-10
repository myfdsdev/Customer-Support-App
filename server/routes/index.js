'use strict';

const express = require('express');
const env = require('../config/env');
const gemini = require('../services/gemini');
const rag = require('../services/rag');
const { apiLimiter } = require('../middleware/rateLimit');
const { sanitizeInput } = require('../middleware/validate');

const { dashboardRouter, analyticsRouter } = require('./dashboardRoutes');
const { announcementRouter, recommendationRouter } = require('./marketingRoutes');

const router = express.Router();

router.use(apiLimiter);
router.use(sanitizeInput);

/** Health + capability probe. Never exposes secrets, only whether they exist. */
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      env: env.nodeEnv,
      ai: { enabled: gemini.isEnabled(), model: gemini.isEnabled() ? gemini.modelName() : null },
      retrieval: rag.vectorStore.status(),
      time: new Date().toISOString(),
    },
  });
});

router.use('/auth', require('./authRoutes'));
router.use('/support', require('./supportRoutes'));
router.use('/products', require('./productRoutes'));
router.use('/knowledge', require('./knowledgeRoutes'));
router.use('/training', require('./trainingRoutes'));
router.use('/conversations', require('./conversationRoutes'));
router.use('/customers', require('./customerRoutes'));
router.use('/tickets', require('./ticketRoutes'));
router.use('/announcements', announcementRouter);
router.use('/recommendations', recommendationRouter);
router.use('/dashboard', dashboardRouter);
router.use('/analytics', analyticsRouter);

module.exports = router;
