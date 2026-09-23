const express = require('express');
const controller = require('../controllers/admin-access-key.controller');
const validate = require('../../../shared/middleware/request-validator.middleware');
const authAdminAccessKey = require('../../../shared/middleware/auth-admin-access-key.middleware');
const { validateAccessKeySchema } = require('../validators/admin-access-key.validator');

const router = express.Router();

// POST /admin/access-key/validate — public (this IS the entry point; no auth required to call it)
router.post('/access-key/validate', validate(validateAccessKeySchema), controller.validateAccessKey);

// POST /admin/logout — requires an existing valid session
router.post('/logout', authAdminAccessKey, controller.logout);

module.exports = router;
