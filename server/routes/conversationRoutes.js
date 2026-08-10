'use strict';

const express = require('express');
const ctrl = require('../controllers/conversationController');
const { authenticateUser, requireAgent } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { aiLimiter, uploadLimiter } = require('../middleware/rateLimit');

const router = express.Router();
router.use(authenticateUser, requireAgent);

router.get('/', ctrl.listConversations);
router.get('/counts', ctrl.listCounts);

router.get('/:id', ctrl.getConversation);
router.patch('/:id', ctrl.updateConversation);
router.get('/:id/messages', ctrl.listMessages);
router.post('/:id/messages', uploadLimiter, upload.single('file'), ctrl.sendMessage);
router.post('/:id/assign', ctrl.assignConversation);
router.post('/:id/transfer', ctrl.transferConversation);
router.post('/:id/resolve', ctrl.resolveConversation);
router.post('/:id/reopen', ctrl.reopenConversation);
router.post('/:id/summarize', aiLimiter, ctrl.summarize);
router.post('/:id/suggest-reply', aiLimiter, ctrl.suggestReply);

module.exports = router;
