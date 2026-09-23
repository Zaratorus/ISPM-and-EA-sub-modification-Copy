const express = require('express');
const controller = require('../controllers/store-settings.controller');
const validate = require('../../../shared/middleware/request-validator.middleware');
const authAdminAccessKey = require('../../../shared/middleware/auth-admin-access-key.middleware');
const { requirePermission } = require('../../../shared/middleware/rbac.middleware');
const { updateSettingsSchema } = require('../validators/store-settings.validator');

const router = express.Router();

// GET /settings — Public (WhatsApp number only) / Admin (full). Uses the
// OPTIONAL Access-Key check — never rejects, just narrows the response.
router.get('/', authAdminAccessKey.optional, controller.getSettings);

// PUT /settings — Admin
router.put(
  '/',
  authAdminAccessKey,
  requirePermission('SETTINGS_MANAGE'),
  validate(updateSettingsSchema),
  controller.updateSettings
);

module.exports = router;
