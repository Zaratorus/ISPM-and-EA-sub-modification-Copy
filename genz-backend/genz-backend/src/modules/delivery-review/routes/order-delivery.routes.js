/**
 * order-delivery.routes.js
 * GET /orders/:id/delivery — Customer (own) / Admin (Backend/API
 * Architecture Design V1.0, Section 6: "Convenience lookup, same data as
 * [GET /deliveries/:id] via Order context"). Mounted in app.js alongside,
 * not instead of, Module B's order.routes.js at the same `/orders` prefix.
 *
 * Widened to Admin (project-owner decision, 2026-09-12): this was the
 * concrete gap behind "the backend has no endpoint for an admin session
 * to look up an existing delivery by order ID" (previously noted all over
 * the Admin UI) — Admin's Order Detail page can now show live delivery
 * status/history on every visit, not just immediately after creating it.
 */

const express = require('express');
const controller = require('../controllers/delivery.controller');
const validate = require('../../../shared/middleware/request-validator.middleware');
const authCustomerOrAdmin = require('../../../shared/middleware/auth-customer-or-admin.middleware');
const { orderIdParamSchema } = require('../validators/delivery.validator');

const router = express.Router();

router.get('/:id/delivery', authCustomerOrAdmin, validate(orderIdParamSchema), controller.getDeliveryByOrder);

module.exports = router;
