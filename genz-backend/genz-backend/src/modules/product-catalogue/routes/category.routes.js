const express = require('express');
const controller = require('../controllers/category.controller');
const validate = require('../../../shared/middleware/request-validator.middleware');
const authAdminAccessKey = require('../../../shared/middleware/auth-admin-access-key.middleware');
const { requirePermission } = require('../../../shared/middleware/rbac.middleware');
const { createCategorySchema, updateCategorySchema } = require('../validators/category.validator');

const router = express.Router();

// GET /categories — Public (US-04, browsing support)
router.get('/', controller.listCategories);

// POST /categories — Admin (US-04)
router.post(
  '/',
  authAdminAccessKey,
  requirePermission('CATEGORY_MANAGE'),
  validate(createCategorySchema),
  controller.createCategory
);

// PUT /categories/:id — Admin (US-04)
router.put(
  '/:id',
  authAdminAccessKey,
  requirePermission('CATEGORY_MANAGE'),
  validate(updateCategorySchema),
  controller.updateCategory
);

module.exports = router;
