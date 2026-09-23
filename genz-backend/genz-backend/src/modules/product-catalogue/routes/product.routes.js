const express = require('express');
const controller = require('../controllers/product.controller');
const validate = require('../../../shared/middleware/request-validator.middleware');
const authAdminAccessKey = require('../../../shared/middleware/auth-admin-access-key.middleware');
const { requirePermission } = require('../../../shared/middleware/rbac.middleware');
const {
  searchProductsSchema,
  productIdParamSchema,
  createProductSchema,
  updateProductSchema,
  adjustStockSchema,
  addImageSchema,
} = require('../validators/product.validator');

const router = express.Router();

// ---- Public / guest-accessible (no auth — DEC-02: browsing never requires login) ----

// GET /products — US-05
router.get('/', validate(searchProductsSchema), controller.searchProducts);

// GET /products/:id — US-06, US-07
router.get('/:id', validate(productIdParamSchema), controller.getProductDetail);

// ---- Admin only ----

// POST /products — US-01
router.post(
  '/',
  authAdminAccessKey,
  requirePermission('PRODUCT_MANAGE'),
  validate(createProductSchema),
  controller.createProduct
);

// PUT /products/:id — US-02
router.put(
  '/:id',
  authAdminAccessKey,
  requirePermission('PRODUCT_MANAGE'),
  validate(updateProductSchema),
  controller.updateProduct
);

// DELETE /products/:id — US-03 (soft delete)
router.delete(
  '/:id',
  authAdminAccessKey,
  requirePermission('PRODUCT_MANAGE'),
  validate(productIdParamSchema),
  controller.discontinueProduct
);

// PATCH /products/:id/stock — DEC-05 manual adjustment
router.patch(
  '/:id/stock',
  authAdminAccessKey,
  requirePermission('PRODUCT_MANAGE'),
  validate(adjustStockSchema),
  controller.adjustStock
);

// POST /products/:id/images
router.post(
  '/:id/images',
  authAdminAccessKey,
  requirePermission('PRODUCT_MANAGE'),
  validate(addImageSchema),
  controller.addProductImage
);

module.exports = router;
