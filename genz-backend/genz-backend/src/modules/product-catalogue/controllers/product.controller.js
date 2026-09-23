const productService = require('../services/product.service');
const activityLogService = require('../../store-administration/services/activity-log.service');
const asyncHandler = require('../../../shared/utils/asyncHandler');
const actorFromRequest = require('../../../shared/utils/actor-from-request');

// GET /products — US-05 (public, guest-accessible: no auth middleware applied)
const searchProducts = asyncHandler(async (req, res) => {
  const result = await productService.searchProducts(req.query);
  res.status(200).json(result);
});

// GET /products/:id — US-06, US-07 (public)
const getProductDetail = asyncHandler(async (req, res) => {
  const data = await productService.getProductDetail(req.params.id);
  res.status(200).json({ data });
});

// POST /products — US-01 (admin)
const createProduct = asyncHandler(async (req, res) => {
  const data = await productService.createProduct(req.body, actorFromRequest(req));
  res.status(201).json({ data });
});

// PUT /products/:id — US-02 (admin)
const updateProduct = asyncHandler(async (req, res) => {
  const data = await productService.updateProduct(req.params.id, req.body, actorFromRequest(req));
  res.status(200).json({ data });
});

// DELETE /products/:id — US-03 (admin) — soft delete (status=DISCONTINUED)
const discontinueProduct = asyncHandler(async (req, res) => {
  const data = await productService.discontinueProduct(req.params.id, actorFromRequest(req));
  res.status(200).json({ data });
});

// PATCH /products/:id/stock — DEC-05 manual adjustment (admin)
const adjustStock = asyncHandler(async (req, res) => {
  const data = await productService.adjustStockManually(req.params.id, req.body);

  // Per Backend/API Architecture Design V1.0 Section 12 and Physical Schema
  // Design V1.0 Section 8/19: every stock mutation, including this manual
  // correction path, is traceable through the single, central Activity Log.
  const { actorType, actorId } = actorFromRequest(req);
  await activityLogService.logActivity({
    actorType,
    actorId,
    actionType: 'STOCK_MANUAL_ADJUSTMENT',
    affectedEntityType: 'Product',
    affectedEntityId: Number(req.params.id),
    originatingModule: 'A',
    contextNote: req.body.reason,
  });

  res.status(200).json({ data });
});

// POST /products/:id/images (admin)
const addProductImage = asyncHandler(async (req, res) => {
  const data = await productService.addProductImage(req.params.id, req.body);
  res.status(201).json({ data });
});

module.exports = {
  searchProducts,
  getProductDetail,
  createProduct,
  updateProduct,
  discontinueProduct,
  adjustStock,
  addProductImage,
};
