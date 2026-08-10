'use strict';

const express = require('express');
const ctrl = require('../controllers/customerController');
const { authenticateUser, requireAgent } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateUser, requireAgent);

router.get('/', ctrl.listCustomers);
router.get('/online', ctrl.listOnlineCustomers);
router.get('/:id', ctrl.getCustomer);
router.patch('/:id', ctrl.updateCustomer);
router.post('/:id/notes', ctrl.addNote);
router.delete('/:id/notes/:noteId', ctrl.deleteNote);
router.put('/:id/products/:productId', ctrl.upsertCustomerProduct);
router.delete('/:id/products/:productId', ctrl.removeCustomerProduct);

module.exports = router;
