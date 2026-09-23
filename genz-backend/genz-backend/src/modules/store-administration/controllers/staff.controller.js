const staffService = require('../services/staff.service');
const asyncHandler = require('../../../shared/utils/asyncHandler');
const actorFromRequest = require('../../../shared/utils/actor-from-request');

// GET /staff — Admin
const listStaff = asyncHandler(async (req, res) => {
  const data = await staffService.listStaff();
  res.status(200).json({ data });
});

// POST /staff — Admin (Owner-level)
const createStaff = asyncHandler(async (req, res) => {
  const data = await staffService.createStaff(req.body, actorFromRequest(req));
  res.status(201).json({ data });
});

// PUT /staff/:id — Admin
const updateStaff = asyncHandler(async (req, res) => {
  const data = await staffService.updateStaff(req.params.id, req.body, actorFromRequest(req));
  res.status(200).json({ data });
});

// PATCH /staff/:id/deactivate — Admin
const deactivateStaff = asyncHandler(async (req, res) => {
  const data = await staffService.deactivateStaff(req.params.id, actorFromRequest(req));
  res.status(200).json({ data });
});

module.exports = { listStaff, createStaff, updateStaff, deactivateStaff };
