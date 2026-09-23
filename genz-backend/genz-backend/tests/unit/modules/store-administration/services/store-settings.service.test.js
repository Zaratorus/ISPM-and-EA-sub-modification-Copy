/**
 * store-settings.service.test.js
 * Verifies the public/admin response split and the single-row upsert.
 */

jest.mock('../../../../../src/modules/store-administration/repositories/store-settings.repository', () => ({
  getSettings: jest.fn(),
  upsertSettings: jest.fn(),
}));
jest.mock('../../../../../src/modules/store-administration/services/activity-log.service', () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

const storeSettingsRepository = require('../../../../../src/modules/store-administration/repositories/store-settings.repository');
const activityLogService = require('../../../../../src/modules/store-administration/services/activity-log.service');
const storeSettingsService = require('../../../../../src/modules/store-administration/services/store-settings.service');

const admin = { actorType: 'OWNER_ADMIN', actorId: null };

beforeEach(() => jest.clearAllMocks());

describe('store-settings.service.getPublicSettings()', () => {
  it('returns only the WhatsApp number', async () => {
    storeSettingsRepository.getSettings.mockResolvedValue({
      store_name: 'Gen-Z',
      contact_info: 'shop@genz.lk',
      whatsapp_number: '+94123456789',
      updated_at: 'x',
    });
    const result = await storeSettingsService.getPublicSettings();
    expect(result).toEqual({ whatsappNumber: '+94123456789' });
  });

  it('returns a null whatsappNumber when settings have never been configured', async () => {
    storeSettingsRepository.getSettings.mockResolvedValue(null);
    expect(await storeSettingsService.getPublicSettings()).toEqual({ whatsappNumber: null });
  });
});

describe('store-settings.service.getFullSettings()', () => {
  it('404s when settings have never been configured', async () => {
    storeSettingsRepository.getSettings.mockResolvedValue(null);
    await expect(storeSettingsService.getFullSettings()).rejects.toMatchObject({
      statusCode: 404,
      code: 'SETTINGS_NOT_CONFIGURED',
    });
  });

  it('returns the full settings object', async () => {
    storeSettingsRepository.getSettings.mockResolvedValue({
      store_name: 'Gen-Z',
      contact_info: 'shop@genz.lk',
      whatsapp_number: '+94123456789',
      updated_at: 'x',
    });
    const result = await storeSettingsService.getFullSettings();
    expect(result).toEqual({
      storeName: 'Gen-Z',
      contactInfo: 'shop@genz.lk',
      whatsappNumber: '+94123456789',
      updatedAt: 'x',
    });
  });
});

describe('store-settings.service.updateSettings()', () => {
  it('upserts and logs STORE_SETTINGS_UPDATED', async () => {
    storeSettingsRepository.upsertSettings.mockResolvedValue({
      store_name: 'Gen-Z',
      contact_info: 'shop@genz.lk',
      whatsapp_number: '+94123456789',
      updated_at: 'x',
    });

    const input = { storeName: 'Gen-Z', contactInfo: 'shop@genz.lk', whatsappNumber: '+94123456789' };
    const result = await storeSettingsService.updateSettings(input, admin);

    expect(storeSettingsRepository.upsertSettings).toHaveBeenCalledWith(input);
    expect(result.storeName).toBe('Gen-Z');
    expect(activityLogService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'STORE_SETTINGS_UPDATED', originatingModule: 'D', affectedEntityId: 1 })
    );
  });
});
