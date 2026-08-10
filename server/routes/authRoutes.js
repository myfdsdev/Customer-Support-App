'use strict';

const express = require('express');
const { body } = require('express-validator');
const ctrl = require('../controllers/authController');
const { validate } = require('../middleware/validate');
const { authenticateUser, requireManager, requireRole } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const { ROLES, ROLE_LIST } = require('../utils/constants');

const router = express.Router();

const passwordRule = body('password')
  .isLength({ min: 8 })
  .withMessage('Password must be at least 8 characters');

router.get('/setup-state', ctrl.setupState);

router.post(
  '/bootstrap',
  authLimiter,
  [body('name').trim().notEmpty().withMessage('Name is required'), body('email').isEmail().withMessage('Valid email required'), passwordRule],
  validate,
  ctrl.bootstrap
);

router.post(
  '/login',
  authLimiter,
  [body('email').isEmail().withMessage('Valid email required'), body('password').notEmpty().withMessage('Password is required')],
  validate,
  ctrl.login
);

router.use(authenticateUser);

router.get('/me', ctrl.me);
router.post('/logout', ctrl.logout);
router.patch('/profile', ctrl.updateProfile);
router.patch(
  '/password',
  [body('currentPassword').notEmpty(), body('newPassword').isLength({ min: 8 })],
  validate,
  ctrl.changePassword
);

router.get('/agents', ctrl.listAgents);

// Team management
router.get('/users', requireManager, ctrl.listUsers);
router.post(
  '/users',
  requireManager,
  [
    body('name').trim().notEmpty(),
    body('email').isEmail(),
    passwordRule,
    body('role').isIn(ROLE_LIST).withMessage('Invalid role'),
  ],
  validate,
  ctrl.createUser
);
router.patch('/users/:id', requireManager, ctrl.updateUser);
router.delete('/users/:id', requireRole(ROLES.SUPER_ADMIN), ctrl.deleteUser);

module.exports = router;
