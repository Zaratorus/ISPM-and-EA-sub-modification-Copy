const express = require('express');
const controller = require('../controllers/staff.controller');
const validate = require('../../../shared/middleware/request-validator.middleware');
const authAdminAccessKey = require('../../../shared/middleware/auth-admin-access-key.middleware');
const { requirePermission } = require('../../../shared/middleware/rbac.middleware');
const { createStaffSchema, staffIdParamSchema, updateStaffSchema } = require('../validators/staff.validator');

const router = express.Router();

// GET /staff — Admin — US-21
router.get('/', authAdminAccessKey, requirePermission('STAFF_MANAGE'), controller.listStaff);

/**
 * POST /staff — Admin **(Owner-level)**, per Backend/API Architecture
 * Design V1.0, Section 6 — a narrower requirement than the other three
 * Staff endpoints below (plain "Admin"). Deliberately uses
 * authAdminAccessKey ALONE, with no requirePermission() call: creating new
 * privileged accounts stays Owner/Admin-Access-Key-exclusive even once
 * Staff authentication (OPEN item 1) is eventually resolved and Staff
 * sessions can populate req.staffSession — a Staff session, however
 * permissioned, will never pass authAdminAccessKey's Owner/Admin-specific
 * check. GET/PUT/PATCH below use requirePermission() instead, so they
 * remain Owner-only for now but are structurally ready for an
 * appropriately-permissioned Staff session later, exactly like every
 * other admin-marked endpoint already built in this codebase.
 */
router.post('/', authAdminAccessKey, validate(createStaffSchema), controller.createStaff);

// PUT /staff/:id — Admin — US-21
router.put(
  '/:id',
  authAdminAccessKey,
  requirePermission('STAFF_MANAGE'),
  validate(updateStaffSchema),
  controller.updateStaff
);

// PATCH /staff/:id/deactivate — Admin — US-21
router.patch(
  '/:id/deactivate',
  authAdminAccessKey,
  requirePermission('STAFF_MANAGE'),
  validate(staffIdParamSchema),
  controller.deactivateStaff
);

module.exports = router;
