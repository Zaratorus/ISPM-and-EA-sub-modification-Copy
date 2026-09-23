/**
 * store-settings.service.js
 * Owning module: D (EP-04). Store-wide configuration, exactly one row
 * (Logical Database Design V1.1, Section D4).
 */

const ApiError = require('../../../shared/utils/ApiError');
const storeSettingsRepository = require('../repositories/store-settings.repository');
const activityLogService = require('./activity-log.service');

function toDTO(row) {
  return {
    storeName: row.store_name,
    contactInfo: row.contact_info,
    whatsappNumber: row.whatsapp_number,
    updatedAt: row.updated_at,
  };
}

// GET /settings — Public path. Only the WhatsApp number, per Backend/API
// Architecture Design V1.0, Section 6: "Public (WhatsApp number only)".
async function getPublicSettings() {
  const row = await storeSettingsRepository.getSettings();
  return { whatsappNumber: row ? row.whatsapp_number : null };
}

// GET /settings — Admin path. Full settings object.
async function getFullSettings() {
  const row = await storeSettingsRepository.getSettings();
  if (!row) {
    throw ApiError.notFound('SETTINGS_NOT_CONFIGURED', 'Store settings have not been configured yet.');
  }
  return toDTO(row);
}

// PUT /settings — Admin.
async function updateSettings(input, actor) {
  const row = await storeSettingsRepository.upsertSettings(input);

  await activityLogService.logActivity({
    actorType: actor.actorType,
    actorId: actor.actorId,
    actionType: 'STORE_SETTINGS_UPDATED',
    affectedEntityType: 'StoreSettings',
    affectedEntityId: 1,
    originatingModule: 'D',
  });

  return toDTO(row);
}

module.exports = { getPublicSettings, getFullSettings, updateSettings };
