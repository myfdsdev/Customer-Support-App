'use strict';

const express = require('express');
const { body } = require('express-validator');
const ctrl = require('../controllers/productController');
const { validate } = require('../middleware/validate');
const { authenticateUser, requireManager, validateProductAccess } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateUser);

router.get('/', ctrl.listProducts);

router.post(
  '/',
  requireManager,
  [
    body('name').trim().notEmpty().withMessage('Product name is required'),
    body('slug').optional().matches(/^[a-z0-9-]+$/i).withMessage('Slug may only contain letters, numbers and hyphens'),
  ],
  validate,
  ctrl.createProduct
);

router.get('/:productId', validateProductAccess(), ctrl.getProduct);
router.patch('/:productId', requireManager, validateProductAccess(), ctrl.updateProduct);
router.delete('/:productId', requireManager, validateProductAccess(), ctrl.deleteProduct);
router.put('/:productId/agents', requireManager, validateProductAccess(), ctrl.setProductAgents);
router.get('/:productId/customers', validateProductAccess(), ctrl.productCustomers);

module.exports = router;
