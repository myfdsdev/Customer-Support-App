'use strict';

const express = require('express');
const ctrl = require('../controllers/customerController');
const { authenticateUser, requireAgent, requireManager } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateUser, requireAgent);

router.get('/', ctrl.listCustomers);
router.get('/online', ctrl.listOnlineCustomers);
router.get('/:id', ctrl.getCustomer);
router.patch('/:id', ctrl.updateCustomer);
router.post('/:id/notes', ctrl.addNote);
router.delete('/:id/notes/:noteId', ctrl.deleteNote);
// Granting or removing product access is a money decision, not a support
// action: managers and super admins only, and every change is audited.
router.put('/:id/products/:productId', requireManager, ctrl.upsertCustomerProduct);
router.delete('/:id/products/:productId', requireManager, ctrl.removeCustomerProduct);

module.exports = router;
