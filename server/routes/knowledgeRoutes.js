'use strict';

const express = require('express');
const { body } = require('express-validator');
const ctrl = require('../controllers/knowledgeController');
const { validate } = require('../middleware/validate');
const { authenticateUser, requireAgent, requireManager, validateProductAccess } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateUser, requireAgent);

router.get('/categories', ctrl.categories);
router.post('/test-retrieval', validateProductAccess('body'), ctrl.testRetrieval);
router.post('/reindex', requireManager, ctrl.reindex);

router.get('/', ctrl.listKnowledge);
router.post(
  '/',
  [
    body('productId').notEmpty().withMessage('productId is required'),
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('content').trim().notEmpty().withMessage('Content is required'),
    body('category').notEmpty().withMessage('Category is required'),
  ],
  validate,
  validateProductAccess('body'),
  ctrl.createKnowledge
);

router.get('/:id', ctrl.getKnowledge);
router.patch('/:id', ctrl.updateKnowledge);
router.patch('/:id/toggle', ctrl.toggleKnowledge);
router.delete('/:id', ctrl.deleteKnowledge);

module.exports = router;
