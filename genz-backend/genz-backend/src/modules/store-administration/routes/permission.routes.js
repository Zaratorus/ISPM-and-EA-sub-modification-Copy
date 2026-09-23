const express = require('express');
const controller = require('../controllers/role-permission.controller');
const authAdminAccessKey = require('../../../shared/middleware/auth-admin-access-key.middleware');
const { requirePermission } = require('../../../shared/middleware/rbac.middleware');

const router = express.Router();

// GET /permissions — Admin — US-22
router.get('/', authAdminAccessKey, requirePermission('ROLE_MANAGE'), controller.listPermissions);

module.exports = router;
