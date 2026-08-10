'use strict';

const express = require('express');
const ctrl = require('../controllers/dashboardController');
const { authenticateUser, requireAgent } = require('../middleware/auth');

const dashboardRouter = express.Router();
dashboardRouter.use(authenticateUser, requireAgent);
dashboardRouter.get('/stats', ctrl.stats);
dashboardRouter.get('/product-breakdown', ctrl.productBreakdown);
dashboardRouter.get('/recent', ctrl.recent);

const analyticsRouter = express.Router();
analyticsRouter.use(authenticateUser, requireAgent);
analyticsRouter.get('/', ctrl.analytics);

module.exports = { dashboardRouter, analyticsRouter };
