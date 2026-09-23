/**
 * store-settings.routes.test.js
 * Verifies GET /settings's documented hybrid contract: Public gets ONLY
 * the WhatsApp number, Admin gets the full object — the same request,
 * gated purely by whether a valid Access-Key token is present (optional
 * auth, never rejects).
 */

jest.mock('../../../../../src/modules/store-administration/services/store-settings.service', () => ({
  getPublicSettings: jest.fn().mockResolvedValue({ whatsappNumber: '+94123456789' }),
  getFullSettings: jest
    .fn()
    .mockResolvedValue({ storeName: 'Gen-Z', contactInfo: 'shop@genz.lk', whatsappNumber: '+94123456789' }),
  updateSettings: jest
    .fn()
    .mockResolvedValue({ storeName: 'Gen-Z', contactInfo: 'shop@genz.lk', whatsappNumber: '+94123456789' }),
}));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const config = require('../../../../../src/config/env.config');
const storeSettingsService = require('../../../../../src/modules/store-administration/services/store-settings.service');
const settingsRoutes = require('../../../../../src/modules/store-administration/routes/store-settings.routes');
const errorHandler = require('../../../../../src/shared/middleware/error-handler.middleware');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/settings', settingsRoutes);
  app.use(errorHandler);
  return app;
}

function adminToken() {
  return jwt.sign({ type: 'OWNER_ADMIN' }, config.adminAccessKey.sessionJwtSecret, { expiresIn: '1h' });
}

beforeEach(() => jest.clearAllMocks());

describe('GET /settings — hybrid Public / Admin contract', () => {
  it('200s with only the WhatsApp number when no token is given (never rejects)', async () => {
    const res = await request(buildApp()).get('/api/v1/settings');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ whatsappNumber: '+94123456789' });
    expect(storeSettingsService.getPublicSettings).toHaveBeenCalled();
    expect(storeSettingsService.getFullSettings).not.toHaveBeenCalled();
  });

  it('200s with only the WhatsApp number when an invalid token is given (still never rejects)', async () => {
    const res = await request(buildApp()).get('/api/v1/settings').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ whatsappNumber: '+94123456789' });
    expect(storeSettingsService.getFullSettings).not.toHaveBeenCalled();
  });

  it('200s with the FULL settings object when a valid Admin token is given', async () => {
    const res = await request(buildApp()).get('/api/v1/settings').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ storeName: 'Gen-Z', contactInfo: 'shop@genz.lk', whatsappNumber: '+94123456789' });
    expect(storeSettingsService.getFullSettings).toHaveBeenCalled();
    expect(storeSettingsService.getPublicSettings).not.toHaveBeenCalled();
  });
});

describe('PUT /settings — Admin only', () => {
  it('401s with no token', async () => {
    const res = await request(buildApp())
      .put('/api/v1/settings')
      .send({ storeName: 'Gen-Z', contactInfo: 'shop@genz.lk', whatsappNumber: '+94123456789' });
    expect(res.status).toBe(401);
    expect(storeSettingsService.updateSettings).not.toHaveBeenCalled();
  });

  it('200s with a valid Admin token and a complete body', async () => {
    const body = { storeName: 'Gen-Z', contactInfo: 'shop@genz.lk', whatsappNumber: '+94123456789' };
    const res = await request(buildApp()).put('/api/v1/settings').set('Authorization', `Bearer ${adminToken()}`).send(body);
    expect(res.status).toBe(200);
    expect(storeSettingsService.updateSettings).toHaveBeenCalledWith(body, { actorType: 'OWNER_ADMIN', actorId: null });
  });

  it('400s when a required field is missing (all three are NOT NULL on store_settings)', async () => {
    const res = await request(buildApp())
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ storeName: 'Gen-Z' });
    expect(res.status).toBe(400);
    expect(storeSettingsService.updateSettings).not.toHaveBeenCalled();
  });
});
