'use strict';

const express = require('express');
const overview = require('../controllers/portalContentController');
const announcements = require('../controllers/announcementController');
const recommendations = require('../controllers/recommendationController');
const { authenticateUser, requireCapability } = require('../middleware/auth');
const { CAPABILITIES } = require('../utils/constants');

/**
 * Admin "Portal content" surface. Mounted at /api/portal-content.
 *
 * Gated on the `manage_portal_content` capability (super_admin,
 * support_manager, marketing_manager). It deliberately reuses the existing
 * announcement/recommendation write handlers rather than duplicating them, so
 * dashboard cards and support-surface cards share one storage model and one
 * validation path. The label is new; the underlying routes stay live.
 */
const router = express.Router();
router.use(authenticateUser, requireCapability(CAPABILITIES.MANAGE_PORTAL_CONTENT));

router.get('/', overview.getPortalContentOverview);

// Dashboard cards / recommendations at portal placements.
router.get('/cards', recommendations.listRecommendations);
router.post('/cards', recommendations.createRecommendation);
router.patch('/cards/:id', recommendations.updateRecommendation);
router.delete('/cards/:id', recommendations.deleteRecommendation);

// Portal announcements / product updates.
router.get('/announcements', announcements.listAnnouncements);
router.post('/announcements', announcements.createAnnouncement);
router.patch('/announcements/:id', announcements.updateAnnouncement);
router.delete('/announcements/:id', announcements.deleteAnnouncement);

module.exports = router;
