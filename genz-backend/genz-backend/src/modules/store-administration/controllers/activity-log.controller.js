const activityLogService = require('../services/activity-log.service');
const asyncHandler = require('../../../shared/utils/asyncHandler');

// GET /activity-log — Admin, filterable
const listActivityLog = asyncHandler(async (req, res) => {
  const data = await activityLogService.listActivityLog(req.query);
  res.status(200).json(data);
});

module.exports = { listActivityLog };
