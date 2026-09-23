const dashboardService = require('../services/dashboard.service');
const asyncHandler = require('../../../shared/utils/asyncHandler');

// GET /dashboard — Admin
const getDashboard = asyncHandler(async (req, res) => {
  const data = await dashboardService.getDashboard();
  res.status(200).json({ data });
});

module.exports = { getDashboard };
