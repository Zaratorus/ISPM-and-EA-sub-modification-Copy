/**
 * admin-access-key.controller.test.js
 * Verifies the newly-wired audit behaviour: both successful AND failed
 * Access Key attempts write to the Activity Log (Detailed System
 * Architecture V1.2, Section 19), while the existing bcrypt/JWT
 * validation logic in admin-access-key.service.js is exercised unchanged
 * (mocked here only to control success/failure, not to alter behaviour).
 */

jest.mock('../../../../../src/modules/store-administration/services/admin-access-key.service', () => ({
  validateAccessKey: jest.fn(),
}));
jest.mock('../../../../../src/modules/store-administration/services/activity-log.service', () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

const express = require('express');
const request = require('supertest');
const adminAccessKeyService = require('../../../../../src/modules/store-administration/services/admin-access-key.service');
const activityLogService = require('../../../../../src/modules/store-administration/services/activity-log.service');
const controller = require('../../../../../src/modules/store-administration/controllers/admin-access-key.controller');
const errorHandler = require('../../../../../src/shared/middleware/error-handler.middleware');
const ApiError = require('../../../../../src/shared/utils/ApiError');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.post('/api/v1/admin/access-key/validate', controller.validateAccessKey);
  app.use(errorHandler);
  return app;
}

beforeEach(() => jest.clearAllMocks());

describe('POST /admin/access-key/validate — Activity Log audit behaviour', () => {
  it('logs ADMIN_ACCESS_KEY_VALIDATED on success', async () => {
    adminAccessKeyService.validateAccessKey.mockResolvedValue('a.jwt.token');

    const res = await request(buildApp()).post('/api/v1/admin/access-key/validate').send({ accessKey: 'correct-key' });

    expect(res.status).toBe(200);
    expect(res.body.data.token).toBe('a.jwt.token');
    expect(activityLogService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: 'OWNER_ADMIN',
        actionType: 'ADMIN_ACCESS_KEY_VALIDATED',
        affectedEntityType: 'AdminAccessKey',
        affectedEntityId: 1,
        originatingModule: 'D',
      })
    );
  });

  it('logs ADMIN_ACCESS_KEY_VALIDATION_FAILED on a wrong key, and still returns the original error response', async () => {
    adminAccessKeyService.validateAccessKey.mockRejectedValue(ApiError.unauthorized('ACCESS_DENIED', 'Access denied.'));

    const res = await request(buildApp()).post('/api/v1/admin/access-key/validate').send({ accessKey: 'wrong-key' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('ACCESS_DENIED');
    expect(activityLogService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: 'SYSTEM',
        actionType: 'ADMIN_ACCESS_KEY_VALIDATION_FAILED',
        affectedEntityType: 'AdminAccessKey',
        affectedEntityId: 1,
        originatingModule: 'D',
      })
    );
  });
});

describe('POST /admin/logout — no audit entry (not in DSA V1.2 Section 19\'s list)', () => {
  it('does not write to the Activity Log', async () => {
    const app = express();
    app.use(express.json());
    app.post('/api/v1/admin/logout', controller.logout);
    app.use(errorHandler);

    const res = await request(app).post('/api/v1/admin/logout');

    expect(res.status).toBe(200);
    expect(activityLogService.logActivity).not.toHaveBeenCalled();
  });
});
