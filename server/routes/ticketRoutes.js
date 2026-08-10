'use strict';

const express = require('express');
const ctrl = require('../controllers/ticketController');
const { authenticateUser, requireAgent, requireManager } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateUser, requireAgent);

router.get('/', ctrl.listTickets);
router.get('/meta', ctrl.ticketMeta);
router.post('/', ctrl.createTicket);
router.get('/:id', ctrl.getTicket);
router.patch('/:id', ctrl.updateTicket);
router.post('/:id/notes', ctrl.addTicketNote);
router.delete('/:id', requireManager, ctrl.deleteTicket);

module.exports = router;
