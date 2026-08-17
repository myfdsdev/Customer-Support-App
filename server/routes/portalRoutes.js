'use strict';

const express = require('express');
const { body } = require('express-validator');
const authCtrl = require('../controllers/portalAuthController');
const portal = require('../controllers/portalController');
const { validate } = require('../middleware/validate');
const { portalAuthLimiter } = require('../middleware/rateLimit');
const {
  authenticateCustomer,
  requireCustomerProductAccess,
} = require('../middleware/customerAuth');

/**
 * Customer membership portal API. Mounted at /api/portal.
 *
 * Auth here is entirely separate from the admin/staff surface: its own token
 * audience, its own cookie, its own middleware. `requireCustomerProductAccess`
 * re-verifies entitlement from the database on every product-scoped call, so
 * URL tampering can never open an unpurchased product.
 */
const router = express.Router();

/* --- Authentication (public, rate-limited) -------------------------------- */
const auth = express.Router();
auth.post(
  '/register',
  portalAuthLimiter,
  [
    body('email').isEmail().withMessage('A valid email is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ],
  validate,
  authCtrl.register
);
auth.post(
  '/login',
  portalAuthLimiter,
  [body('email').isEmail(), body('password').notEmpty()],
  validate,
  authCtrl.login
);
auth.post('/logout', authCtrl.logout);
auth.post(
  '/forgot-password',
  portalAuthLimiter,
  [body('email').isEmail()],
  validate,
  authCtrl.forgotPassword
);
auth.post(
  '/reset-password',
  portalAuthLimiter,
  [body('token').notEmpty(), body('password').isLength({ min: 8 })],
  validate,
  authCtrl.resetPassword
);
auth.post('/verify-email', portalAuthLimiter, [body('token').notEmpty()], validate, authCtrl.verifyEmail);
auth.get('/me', authenticateCustomer, authCtrl.me);
router.use('/auth', auth);

/* --- Everything below requires a signed-in customer ----------------------- */
router.use(authenticateCustomer);

router.get('/dashboard', portal.getDashboard);
router.get('/products', portal.listProducts);
router.post('/products/refresh', portal.refreshPurchases);

// Product detail allows discovery (dashboardVisibility=everyone) products.
router.get('/products/:productSlug', requireCustomerProductAccess({ allowDiscovery: true }), portal.getProductPage);
// Launch is owner-only; access is re-verified inside the guard and the handler.
router.post('/products/:productId/launch', requireCustomerProductAccess(), portal.launchProduct);

router.get('/support/products', portal.supportProducts);
// Starting support requires an active purchase of the product being asked
// about. Keyed by slug so the dedicated chat pages (which only know the slug)
// can start a session directly from a bookmarked URL.
router.post('/support/:productSlug/start', requireCustomerProductAccess(), portal.startSupport);

router.get('/conversations', portal.listConversations);

router.get('/notifications', portal.listNotifications);
router.patch('/notifications/read-all', portal.markAllNotificationsRead);
router.patch('/notifications/:id/read', portal.markNotificationRead);

router.get('/profile', portal.getProfile);
router.patch('/profile', portal.updateProfile);

module.exports = router;
