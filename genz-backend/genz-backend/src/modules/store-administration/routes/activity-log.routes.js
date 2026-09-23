const express = require('express');
const controller = require('../controllers/activity-log.controller');
const validate = require('../../../shared/middleware/request-validator.middleware');
const authAdminAccessKey = require('../../../shared/middleware/auth-admin-access-key.middleware');
const { requirePermission } = require('../../../shared/middleware/rbac.middleware');
const { listActivityLogQuerySchema } = require('../validators/activity-log.validator');

const router = express.Router();

// GET /activity-log — Admin, filterable — US-25
router.get(
  '/',
  authAdminAccessKey,
  requirePermission('ACTIVITY_LOG_VIEW'),
  validate(listActivityLogQuerySchema),
  controller.listActivityLog
);

module.exports = router;
