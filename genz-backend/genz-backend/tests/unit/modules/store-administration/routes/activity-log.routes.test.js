jest.mock('../../../../../src/modules/store-administration/services/activity-log.service', () => ({
  listActivityLog: jest.fn().mockResolvedValue({ data: [], meta: { page: 1, limit: 20, total: 0 } }),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const config = require('../../../../../src/config/env.config');
const activityLogService = require('../../../../../src/modules/store-administration/services/activity-log.service');
const activityLogRoutes = require('../../../../../src/modules/store-administration/routes/activity-log.routes');
const errorHandler = require('../../../../../src/shared/middleware/error-handler.middleware');

function buildApp() {
  const app = express();
  app.use('/api/v1/activity-log', activityLogRoutes);
  app.use(errorHandler);
  return app;
}

function adminToken() {
  return jwt.sign({ type: 'OWNER_ADMIN' }, config.adminAccessKey.sessionJwtSecret, { expiresIn: '1h' });
}

beforeEach(() => jest.clearAllMocks());

describe('GET /activity-log — Admin only, filterable', () => {
  it('401s with no token', async () => {
    const res = await request(buildApp()).get('/api/v1/activity-log');
    expect(res.status).toBe(401);
    expect(activityLogService.listActivityLog).not.toHaveBeenCalled();
  });

  it('200s with a valid Admin token', async () => {
    const res = await request(buildApp()).get('/api/v1/activity-log').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(activityLogService.listActivityLog).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 20 })
    );
  });

  it('passes originatingModule and actionType filters through', async () => {
    const res = await request(buildApp())
      .get('/api/v1/activity-log?originatingModule=D&actionType=STAFF_CREATED')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(activityLogService.listActivityLog).toHaveBeenCalledWith(
      expect.objectContaining({ originatingModule: 'D', actionType: 'STAFF_CREATED' })
    );
  });

  it('400s an invalid originatingModule value', async () => {
    const res = await request(buildApp())
      .get('/api/v1/activity-log?originatingModule=Z')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
    expect(activityLogService.listActivityLog).not.toHaveBeenCalled();
  });
});
