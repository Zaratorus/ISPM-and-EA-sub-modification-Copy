const express = require('express');
const controller = require('../controllers/delivery.controller');
const validate = require('../../../shared/middleware/request-validator.middleware');
const authCustomerOrAdmin = require('../../../shared/middleware/auth-customer-or-admin.middleware');
const authAdminAccessKey = require('../../../shared/middleware/auth-admin-access-key.middleware');
const { requirePermission } = require('../../../shared/middleware/rbac.middleware');
const authCourierLink = require('../../../shared/middleware/auth-courier-link.middleware');
const {
  deliveryIdParamSchema,
  createDeliverySchema,
  advanceDeliveryStatusSchema,
} = require('../validators/delivery.validator');

const router = express.Router();

// GET /deliveries/:id — Customer (own, via order) / Admin — US-16, read-only.
router.get('/:id', authCustomerOrAdmin, validate(deliveryIdParamSchema), controller.getDeliveryDetail);

/**
 * GET /deliveries/:id/courier and PATCH /deliveries/:id/courier/status —
 * Delivery Person surface.
 *
 * Project-owner decision (2026-09-12): the Delivery Person has no account
 * (no role, no login). Knowing the delivery ID is NOT enough, though: every
 * request must carry the signed courier token from the link the Admin shares
 * (X-Courier-Token header, checked by auth-courier-link.middleware.js). The
 * token is an HMAC of the delivery ID, so it works for that one delivery
 * only and sequential IDs can no longer be guessed.
 *
 * The Admin's own status-advance endpoint stays removed — once a Delivery
 * exists, only these two routes can move it. Admin retains creation
 * (POST /deliveries) and read-only visibility (GET /deliveries/:id above).
 */
router.get('/:id/courier', authCourierLink, validate(deliveryIdParamSchema), controller.courierGetDelivery);
router.patch(
  '/:id/courier/status',
  authCourierLink,
  validate(advanceDeliveryStatusSchema),
  controller.courierAdvanceStatus
);

/**
 * POST /deliveries — Admin. "Create delivery record + assign delivery
 * person (system-triggered at Ready-for-Delivery handover, exposed here
 * for admin-initiated assignment)" (Backend/API Architecture Design V1.0,
 * Section 6). Requires `orderId` in the body; the Order must be
 * Ready-for-Delivery and must not already have a Delivery. The delivery
 * address is read from Module B's Order (project-owner amendment — see
 * delivery.service.js.createDelivery()), never typed in here directly.
 */
router.post(
  '/',
  authAdminAccessKey,
  requirePermission('DELIVERY_MANAGE'),
  validate(createDeliverySchema),
  controller.createDelivery
);

module.exports = router;
