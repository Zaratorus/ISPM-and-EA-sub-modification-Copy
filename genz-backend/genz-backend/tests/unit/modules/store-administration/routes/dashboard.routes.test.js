jest.mock('../../../../../src/modules/store-administration/services/dashboard.service', () => ({
  getDashboard: jest.fn().mockResolvedValue({ productCatalogue: { totalActiveProducts: 1 } }),
}));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const config = require('../../../../../src/config/env.config');
const dashboardService = require('../../../../../src/modules/store-administration/services/dashboard.service');
const dashboardRoutes = require('../../../../../src/modules/store-administration/routes/dashboard.routes');
const errorHandler = require('../../../../../src/shared/middleware/error-handler.middleware');

function buildApp() {
  const app = express();
  app.use('/api/v1/dashboard', dashboardRoutes);
  app.use(errorHandler);
  return app;
}

function adminToken() {
  return jwt.sign({ type: 'OWNER_ADMIN' }, config.adminAccessKey.sessionJwtSecret, { expiresIn: '1h' });
}

describe('GET /dashboard — Admin only', () => {
  beforeEach(() => jest.clearAllMocks());

  it('401s with no token', async () => {
    const res = await request(buildApp()).get('/api/v1/dashboard');
    expect(res.status).toBe(401);
    expect(dashboardService.getDashboard).not.toHaveBeenCalled();
  });

  it('200s with a valid Admin token', async () => {
    const res = await request(buildApp()).get('/api/v1/dashboard').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.productCatalogue.totalActiveProducts).toBe(1);
  });
});
