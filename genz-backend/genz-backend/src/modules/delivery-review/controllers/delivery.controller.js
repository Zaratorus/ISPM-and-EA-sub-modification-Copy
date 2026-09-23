const deliveryService = require('../services/delivery.service');
const asyncHandler = require('../../../shared/utils/asyncHandler');
const actorFromRequest = require('../../../shared/utils/actor-from-request');
const { courierLinkFor } = require('../../../shared/utils/courier-link');

// Admin responses carry the delivery's signed courier link (courierToken +
// courierPath) so the Admin UI can share it with the Delivery Person.
// Customers never receive it — it would let them advance their own delivery.
function withCourierLink(data) {
  return { ...data, ...courierLinkFor(data.deliveryId) };
}

// GET /deliveries/:id — Customer (own) / Admin
const getDeliveryDetail = asyncHandler(async (req, res) => {
  const data = await deliveryService.getDeliveryById(req.params.id);
  if (req.customer) {
    await deliveryService.assertCustomerOwnsDelivery(data, req.customer.customerId);
    return res.status(200).json({ data });
  }
  return res.status(200).json({ data: withCourierLink(data) });
});

// GET /orders/:id/delivery — Customer (own) / Admin (2026-09-12: widened,
// see order-delivery.routes.js) — same req.customer-presence check already
// used by getDeliveryDetail above.
const getDeliveryByOrder = asyncHandler(async (req, res) => {
  const data = await deliveryService.getDeliveryByOrderId(req.params.id);
  if (req.customer) {
    await deliveryService.assertCustomerOwnsDelivery(data, req.customer.customerId);
    return res.status(200).json({ data });
  }
  return res.status(200).json({ data: withCourierLink(data) });
});

// GET /deliveries/:id/courier — Delivery Person, signed courier link required
// (auth-courier-link.middleware.js). Returns only the courier's view.
const courierGetDelivery = asyncHandler(async (req, res) => {
  const data = await deliveryService.getDeliveryById(req.params.id);
  res.status(200).json({ data: deliveryService.toCourierDelivery(data) });
});

// PATCH /deliveries/:id/courier/status — Delivery Person, signed courier link
// required. The only way a Delivery's status advances beyond ASSIGNED — Admin
// does not have an equivalent endpoint (project-owner decision, 2026-09-12).
const courierAdvanceStatus = asyncHandler(async (req, res) => {
  const data = await deliveryService.advanceStatus(req.params.id, req.body.status);
  res.status(200).json({ data: deliveryService.toCourierDelivery(data) });
});

// POST /deliveries — Admin. The response includes the new delivery's courier link.
const createDelivery = asyncHandler(async (req, res) => {
  const data = await deliveryService.createDelivery(req.body, actorFromRequest(req));
  res.status(201).json({ data: withCourierLink(data) });
});

module.exports = { getDeliveryDetail, getDeliveryByOrder, courierGetDelivery, courierAdvanceStatus, createDelivery };
