const roleService = require('../services/role-permission.service');
const asyncHandler = require('../../../shared/utils/asyncHandler');
const actorFromRequest = require('../../../shared/utils/actor-from-request');

// GET /roles — Admin
const listRoles = asyncHandler(async (req, res) => {
  const data = await roleService.listRoles();
  res.status(200).json({ data });
});

// POST /roles — Admin
const createRole = asyncHandler(async (req, res) => {
  const data = await roleService.createRole(req.body, actorFromRequest(req));
  res.status(201).json({ data });
});

// GET /permissions — Admin
const listPermissions = asyncHandler(async (req, res) => {
  const data = await roleService.listPermissions();
  res.status(200).json({ data });
});

// POST /roles/:id/permissions — Admin
const assignPermissions = asyncHandler(async (req, res) => {
  const data = await roleService.assignPermissionsToRole(req.params.id, req.body.permissionIds, actorFromRequest(req));
  res.status(200).json({ data });
});

module.exports = { listRoles, createRole, listPermissions, assignPermissions };
