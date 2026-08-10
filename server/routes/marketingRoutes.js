'use strict';

const express = require('express');
const announcements = require('../controllers/announcementController');
const recommendations = require('../controllers/recommendationController');
const { authenticateUser, requireMarketing, requireRole } = require('../middleware/auth');
const { AGENT_ROLES, ROLES } = require('../utils/constants');

// Support staff read announcements to answer customers; marketing writes them.
const canReadAnnouncements = requireRole(...AGENT_ROLES, ROLES.MARKETING_MANAGER);

const announcementRouter = express.Router();
announcementRouter.use(authenticateUser);
announcementRouter.get('/', canReadAnnouncements, announcements.listAnnouncements);
announcementRouter.post('/', requireMarketing, announcements.createAnnouncement);
announcementRouter.patch('/:id', requireMarketing, announcements.updateAnnouncement);
announcementRouter.delete('/:id', requireMarketing, announcements.deleteAnnouncement);

const recommendationRouter = express.Router();
recommendationRouter.use(authenticateUser, requireMarketing);
recommendationRouter.get('/', recommendations.listRecommendations);
recommendationRouter.post('/', recommendations.createRecommendation);
recommendationRouter.patch('/:id', recommendations.updateRecommendation);
recommendationRouter.delete('/:id', recommendations.deleteRecommendation);

module.exports = { announcementRouter, recommendationRouter };
