const express = require('express');
const controller = require('../controllers/dashboard.controller');
const authAdminAccessKey = require('../../../shared/middleware/auth-admin-access-key.middleware');
const { requirePermission } = require('../../../shared/middleware/rbac.middleware');

const router = express.Router();

// GET /dashboard — Admin — US-23
router.get('/', authAdminAccessKey, requirePermission('DASHBOARD_VIEW'), controller.getDashboard);

module.exports = router;
