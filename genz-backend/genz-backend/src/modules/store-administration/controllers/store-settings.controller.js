const storeSettingsService = require('../services/store-settings.service');
const asyncHandler = require('../../../shared/utils/asyncHandler');
const actorFromRequest = require('../../../shared/utils/actor-from-request');

// GET /settings — Public (WhatsApp number only) / Admin (full)
const getSettings = asyncHandler(async (req, res) => {
  const data = req.adminSession
    ? await storeSettingsService.getFullSettings()
    : await storeSettingsService.getPublicSettings();
  res.status(200).json({ data });
});

// PUT /settings — Admin
const updateSettings = asyncHandler(async (req, res) => {
  const data = await storeSettingsService.updateSettings(req.body, actorFromRequest(req));
  res.status(200).json({ data });
});

module.exports = { getSettings, updateSettings };
