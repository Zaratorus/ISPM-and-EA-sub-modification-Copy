/**
 * staff.routes.test.js
 * Verifies all four Staff endpoints require an Admin (Owner) session, and
 * that request validation runs before the service layer.
 */

jest.mock('../../../../../src/modules/store-administration/services/staff.service', () => ({
  listStaff: jest.fn().mockResolvedValue([]),
  createStaff: jest.fn().mockResolvedValue({ staffAdminUserId: 1, roleId: 2, name: 'Jane', status: 'ACTIVE' }),
  updateStaff: jest.fn().mockResolvedValue({ staffAdminUserId: 1, roleId: 2, name: 'Jane Doe', status: 'ACTIVE' }),
  deactivateStaff: jest.fn().mockResolvedValue({ staffAdminUserId: 1, roleId: 2, name: 'Jane', status: 'DEACTIVATED' }),
}));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const config = require('../../../../../src/config/env.config');
const staffService = require('../../../../../src/modules/store-administration/services/staff.service');
const staffRoutes = require('../../../../../src/modules/store-administration/routes/staff.routes');
const errorHandler = require('../../../../../src/shared/middleware/error-handler.middleware');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/staff', staffRoutes);
  app.use(errorHandler);
  return app;
}

function adminToken() {
  return jwt.sign({ type: 'OWNER_ADMIN' }, config.adminAccessKey.sessionJwtSecret, { expiresIn: '1h' });
}

beforeEach(() => jest.clearAllMocks());

describe('GET /staff', () => {
  it('401s with no token', async () => {
    const res = await request(buildApp()).get('/api/v1/staff');
    expect(res.status).toBe(401);
    expect(staffService.listStaff).not.toHaveBeenCalled();
  });

  it('200s with a valid Admin token', async () => {
    const res = await request(buildApp()).get('/api/v1/staff').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(staffService.listStaff).toHaveBeenCalled();
  });
});

describe('POST /staff — Owner-level only', () => {
  it('401s with no token', async () => {
    const res = await request(buildApp()).post('/api/v1/staff').send({ name: 'Jane', roleId: 2 });
    expect(res.status).toBe(401);
    expect(staffService.createStaff).not.toHaveBeenCalled();
  });

  it('201s with a valid Admin (Owner) token and a valid body', async () => {
    const res = await request(buildApp())
      .post('/api/v1/staff')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'Jane', roleId: 2 });
    expect(res.status).toBe(201);
    expect(staffService.createStaff).toHaveBeenCalledWith(
      { name: 'Jane', roleId: 2 },
      { actorType: 'OWNER_ADMIN', actorId: null }
    );
  });

  it('400s when roleId is missing, before the service is ever called', async () => {
    const res = await request(buildApp()).post('/api/v1/staff').set('Authorization', `Bearer ${adminToken()}`).send({ name: 'Jane' });
    expect(res.status).toBe(400);
    expect(staffService.createStaff).not.toHaveBeenCalled();
  });

  it('never accepts a credentials/password field even if sent — Staff auth mechanism is OPEN', async () => {
    const res = await request(buildApp())
      .post('/api/v1/staff')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'Jane', roleId: 2, password: 'whatever', credentialsReference: 'whatever' });
    expect(res.status).toBe(201);
    // zod strips unknown keys by default — verify neither ever reached the service
    const calledWith = staffService.createStaff.mock.calls[0][0];
    expect(calledWith).not.toHaveProperty('password');
    expect(calledWith).not.toHaveProperty('credentialsReference');
  });
});

describe('PUT /staff/:id', () => {
  it('401s with no token', async () => {
    const res = await request(buildApp()).put('/api/v1/staff/1').send({ name: 'Jane Doe' });
    expect(res.status).toBe(401);
    expect(staffService.updateStaff).not.toHaveBeenCalled();
  });

  it('200s with a valid Admin token', async () => {
    const res = await request(buildApp())
      .put('/api/v1/staff/1')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'Jane Doe' });
    expect(res.status).toBe(200);
    expect(staffService.updateStaff).toHaveBeenCalledWith(1, { name: 'Jane Doe' }, { actorType: 'OWNER_ADMIN', actorId: null });
  });
});

describe('PATCH /staff/:id/deactivate', () => {
  it('401s with no token', async () => {
    const res = await request(buildApp()).patch('/api/v1/staff/1/deactivate');
    expect(res.status).toBe(401);
    expect(staffService.deactivateStaff).not.toHaveBeenCalled();
  });

  it('200s with a valid Admin token', async () => {
    const res = await request(buildApp()).patch('/api/v1/staff/1/deactivate').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('DEACTIVATED');
  });
});
