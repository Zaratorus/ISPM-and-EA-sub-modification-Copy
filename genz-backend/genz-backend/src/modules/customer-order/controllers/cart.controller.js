const cartService = require('../services/cart.service');
const asyncHandler = require('../../../shared/utils/asyncHandler');

// GET /cart — Customer
const getCart = asyncHandler(async (req, res) => {
  const data = await cartService.getCart(req.customer.customerId);
  res.status(200).json({ data });
});

// POST /cart/items — Customer
const addItem = asyncHandler(async (req, res) => {
  const data = await cartService.addItem(req.customer.customerId, req.body);
  res.status(201).json({ data });
});

// PUT /cart/items/:id — Customer
const updateItem = asyncHandler(async (req, res) => {
  const data = await cartService.updateItemQuantity(req.customer.customerId, req.params.id, req.body.quantity);
  res.status(200).json({ data });
});

// DELETE /cart/items/:id — Customer
const removeItem = asyncHandler(async (req, res) => {
  const data = await cartService.removeItem(req.customer.customerId, req.params.id);
  res.status(200).json({ data });
});

module.exports = { getCart, addItem, updateItem, removeItem };
