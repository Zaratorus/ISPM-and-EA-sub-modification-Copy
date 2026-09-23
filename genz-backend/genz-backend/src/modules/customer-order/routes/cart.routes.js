/**
 * cart.routes.js
 * Resolved: Cart is customer-authenticated-only (project-owner decision on
 * the guest-cart-persistence OPEN item — Backend/API Architecture Design
 * V1.0, Section 15 item 2: "Cart only created post-login", not "guest
 * carts persist and merge on login"). Every route below requires an
 * authenticated Customer session; there is no guest-cart path.
 */

const express = require('express');
const controller = require('../controllers/cart.controller');
const validate = require('../../../shared/middleware/request-validator.middleware');
const { authCustomer } = require('../../../shared/middleware/auth-customer.middleware');
const { addCartItemSchema, cartItemIdParamSchema, updateCartItemSchema } = require('../validators/cart.validator');

const router = express.Router();

router.use(authCustomer);

// GET /cart — US-08
router.get('/', controller.getCart);

// POST /cart/items — US-08
router.post('/items', validate(addCartItemSchema), controller.addItem);

// PUT /cart/items/:id — US-08
router.put('/items/:id', validate(updateCartItemSchema), controller.updateItem);

// DELETE /cart/items/:id — US-08
router.delete('/items/:id', validate(cartItemIdParamSchema), controller.removeItem);

module.exports = router;
