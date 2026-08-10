'use strict';

const express = require('express');
const { body } = require('express-validator');
const ctrl = require('../controllers/trainingController');
const { validate } = require('../middleware/validate');
const { authenticateUser, requireAgent, validateProductAccess } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateUser, requireAgent);

router.get('/', ctrl.listVideos);
router.post(
  '/',
  [
    body('productId').notEmpty().withMessage('productId is required'),
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('videoUrl').trim().notEmpty().withMessage('Video URL is required'),
  ],
  validate,
  validateProductAccess('body'),
  ctrl.createVideo
);

router.get('/:id', ctrl.getVideo);
router.patch('/:id', ctrl.updateVideo);
router.patch('/:id/toggle', ctrl.toggleVideo);
router.delete('/:id', ctrl.deleteVideo);

module.exports = router;
