'use strict';

const express = require('express');
const { body } = require('express-validator');
const ctrl = require('../controllers/supportController');
const { validate } = require('../middleware/validate');
const { authenticateSupportSession, matchSessionProduct } = require('../middleware/auth');
const { aiLimiter, sessionLimiter, uploadLimiter } = require('../middleware/rateLimit');
const { upload } = require('../middleware/upload');

const router = express.Router();

/**
 * Public customer surface. Mounted at /api/support.
 *
 * Everything after `authenticateSupportSession` derives its product, session
 * and customer from the signed token — `matchSessionProduct` additionally
 * refuses a token issued for a different product than the URL names.
 */

// --- Open endpoints (no session needed to browse help) ----------------------
router.get('/:productSlug', ctrl.getSupportHome);
router.get('/:productSlug/training', ctrl.listTraining);
router.get('/:productSlug/help', ctrl.listHelp);
router.get('/:productSlug/help/:articleId', ctrl.getHelpArticle);

router.post(
  '/:productSlug/session',
  sessionLimiter,
  [body('anonymousId').optional().isString().isLength({ max: 100 })],
  validate,
  ctrl.startSession
);

// --- Session-scoped endpoints ----------------------------------------------
const scoped = [authenticateSupportSession, matchSessionProduct];

router.post('/:productSlug/session/heartbeat', sessionLimiter, ...scoped, ctrl.heartbeat);
router.post('/:productSlug/session/end', ...scoped, ctrl.endSession);
router.post('/:productSlug/identify', ...scoped, ctrl.identify);

router.get('/:productSlug/conversation', ...scoped, ctrl.getConversation);
router.post(
  '/:productSlug/chat',
  aiLimiter,
  ...scoped,
  [body('message').trim().notEmpty().withMessage('Message cannot be empty')],
  validate,
  ctrl.chat
);
router.post('/:productSlug/handoff', ...scoped, ctrl.handoff);
router.post('/:productSlug/feedback', ...scoped, ctrl.feedback);
router.post('/:productSlug/upload', uploadLimiter, ...scoped, upload.single('file'), ctrl.uploadAttachment);

// Tracking endpoints tolerate a missing session (help pages are browsable
// before a session exists), so they resolve the product from the slug.
router.post('/:productSlug/training/:videoId/click', ctrl.trackVideoClick);
router.post('/:productSlug/recommendations/:id/click', ctrl.trackRecommendationClick);

module.exports = router;
