const express = require('express');
const controller = require('../controllers/order.controller');
const validate = require('../../../shared/middleware/request-validator.middleware');
const { authCustomer } = require('../../../shared/middleware/auth-customer.middleware');
const authCustomerOrAdmin = require('../../../shared/middleware/auth-customer-or-admin.middleware');
const authAdminAccessKey = require('../../../shared/middleware/auth-admin-access-key.middleware');
const { requirePermission } = require('../../../shared/middleware/rbac.middleware');
const {
  orderIdParamSchema,
  checkoutSchema,
  listOrdersQuerySchema,
  advanceStatusSchema,
} = require('../validators/order.validator');

const router = express.Router();

// POST /orders — Customer (mandatory; DEC-02) — checkout, converts the
// customer's active Cart into a Pending Order. Requires deliveryAddress in
// the body (project-owner amendment resolving the EP-03 delivery-address
// schema gap — see order.validator.js).
router.post('/', authCustomer, validate(checkoutSchema), controller.checkout);

// GET /orders — Customer (own) / Admin (all, filterable by status)
router.get('/', authCustomerOrAdmin, validate(listOrdersQuerySchema), controller.listOrders);

// GET /orders/:id — Customer (own) / Admin
router.get('/:id', authCustomerOrAdmin, validate(orderIdParamSchema), controller.getOrderDetail);

// PATCH /orders/:id/confirm — Admin. Pending -> Confirmed; calls
// inventory.service.js.decreaseStock(), transactional.
router.patch(
  '/:id/confirm',
  authAdminAccessKey,
  requirePermission('ORDER_MANAGE'),
  validate(orderIdParamSchema),
  controller.confirmOrder
);

// PATCH /orders/:id/status — Admin. Confirmed -> Processing -> Ready for
// Delivery (separate, non-automatic transition).
router.patch(
  '/:id/status',
  authAdminAccessKey,
  requirePermission('ORDER_MANAGE'),
  validate(advanceStatusSchema),
  controller.advanceStatus
);

/**
 * PATCH /orders/:id/cancel — Customer (own order, Pending only) / Admin
 * (any non-Cancelled stage). Resolves the order-cancellation-authority
 * OPEN item (Backend/API Architecture Design V1.0, Section 15, item 5) per
 * project-owner decision. The Customer-vs-Admin scope check happens inside
 * order.service.js.cancelOrder() (not via requirePermission — Customers
 * carry no RBAC permissions at all, so a Customer-or-Admin route can't use
 * the same permission gate confirm/status use).
 */
router.patch('/:id/cancel', authCustomerOrAdmin, validate(orderIdParamSchema), controller.cancelOrder);

module.exports = router;
