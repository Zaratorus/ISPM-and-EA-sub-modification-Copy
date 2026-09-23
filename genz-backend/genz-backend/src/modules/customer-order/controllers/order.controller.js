const orderService = require('../services/order.service');
const asyncHandler = require('../../../shared/utils/asyncHandler');
const ApiError = require('../../../shared/utils/ApiError');
const actorFromRequest = require('../../../shared/utils/actor-from-request');

// POST /orders — Customer (mandatory; DEC-02)
const checkout = asyncHandler(async (req, res) => {
  const data = await orderService.checkout(req.customer.customerId, req.body);
  res.status(201).json({ data });
});

// GET /orders — Customer (own) / Admin (all, filterable by status)
const listOrders = asyncHandler(async (req, res) => {
  if (req.adminSession) {
    const result = await orderService.listAllOrders(req.query);
    return res.status(200).json(result);
  }
  const result = await orderService.listCustomerOrders(req.customer.customerId, req.query);
  res.status(200).json(result);
});

// GET /orders/:id — Customer (own) / Admin
const getOrderDetail = asyncHandler(async (req, res) => {
  const data = await orderService.getOrderDetail(req.params.id);
  if (req.customer && data.customerId !== req.customer.customerId) {
    throw ApiError.forbidden('FORBIDDEN', "You cannot view another customer's order.");
  }
  res.status(200).json({ data });
});

// PATCH /orders/:id/confirm — Admin
const confirmOrder = asyncHandler(async (req, res) => {
  const data = await orderService.confirmOrder(req.params.id, actorFromRequest(req));
  res.status(200).json({ data });
});

// PATCH /orders/:id/status — Admin
const advanceStatus = asyncHandler(async (req, res) => {
  const data = await orderService.advanceStatus(req.params.id, req.body.status, actorFromRequest(req));
  res.status(200).json({ data });
});

// PATCH /orders/:id/cancel — Customer (own, Pending only) / Admin (any stage)
// Project-owner decision resolving the order-cancellation-authority OPEN item.
const cancelOrder = asyncHandler(async (req, res) => {
  const requester = req.customer
    ? { type: 'CUSTOMER', customerId: req.customer.customerId, actorType: 'CUSTOMER', actorId: req.customer.customerId }
    : { type: 'ADMIN', ...actorFromRequest(req) };
  const data = await orderService.cancelOrder(req.params.id, requester);
  res.status(200).json({ data });
});

module.exports = { checkout, listOrders, getOrderDetail, confirmOrder, advanceStatus, cancelOrder };
