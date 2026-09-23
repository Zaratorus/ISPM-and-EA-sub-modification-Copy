const express = require('express');
const controller = require('../controllers/role-permission.controller');
const validate = require('../../../shared/middleware/request-validator.middleware');
const authAdminAccessKey = require('../../../shared/middleware/auth-admin-access-key.middleware');
const { requirePermission } = require('../../../shared/middleware/rbac.middleware');
const { createRoleSchema, assignPermissionsSchema } = require('../validators/role-permission.validator');

const router = express.Router();

// GET /roles — Admin — US-22
router.get('/', authAdminAccessKey, requirePermission('ROLE_MANAGE'), controller.listRoles);

// POST /roles — Admin — US-22
router.post('/', authAdminAccessKey, requirePermission('ROLE_MANAGE'), validate(createRoleSchema), controller.createRole);

// POST /roles/:id/permissions — Admin — writes role_permissions — US-22
router.post(
  '/:id/permissions',
  authAdminAccessKey,
  requirePermission('ROLE_MANAGE'),
  validate(assignPermissionsSchema),
  controller.assignPermissions
);

module.exports = router;
