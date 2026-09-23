/**
 * role-permission.routes.test.js
 * Covers both role.routes.js and permission.routes.js — all endpoints
 * require an Admin session (RBAC via requirePermission('ROLE_MANAGE'),
 * which Owner/Admin sessions always satisfy by definition).
 */

jest.mock('../../../../../src/modules/store-administration/services/role-permission.service', () => ({
  listRoles: jest.fn().mockResolvedValue([{ roleId: 1, name: 'Sales' }]),
  createRole: jest.fn().mockResolvedValue({ roleId: 2, name: 'Manager' }),
  listPermissions: jest.fn().mockResolvedValue([{ permissionId: 1, name: 'PRODUCT_MANAGE' }]),
  assignPermissionsToRole: jest
    .fn()
    .mockResolvedValue({ roleId: 1, name: 'Sales', permissions: [{ permissionId: 1, name: 'PRODUCT_MANAGE' }] }),
}));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const config = require('../../../../../src/config/env.config');
const roleService = require('../../../../../src/modules/store-administration/services/role-permission.service');
const roleRoutes = require('../../../../../src/modules/store-administration/routes/role.routes');
const permissionRoutes = require('../../../../../src/modules/store-administration/routes/permission.routes');
const errorHandler = require('../../../../../src/shared/middleware/error-handler.middleware');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/roles', roleRoutes);
  app.use('/api/v1/permissions', permissionRoutes);
  app.use(errorHandler);
  return app;
}

function adminToken() {
  return jwt.sign({ type: 'OWNER_ADMIN' }, config.adminAccessKey.sessionJwtSecret, { expiresIn: '1h' });
}

beforeEach(() => jest.clearAllMocks());

describe('GET /roles, POST /roles', () => {
  it('401s GET /roles with no token', async () => {
    const res = await request(buildApp()).get('/api/v1/roles');
    expect(res.status).toBe(401);
  });

  it('200s GET /roles with a valid Admin token', async () => {
    const res = await request(buildApp()).get('/api/v1/roles').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ roleId: 1, name: 'Sales' }]);
  });

  it('201s POST /roles with a valid Admin token and body', async () => {
    const res = await request(buildApp())
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'Manager' });
    expect(res.status).toBe(201);
    expect(roleService.createRole).toHaveBeenCalledWith({ name: 'Manager' }, { actorType: 'OWNER_ADMIN', actorId: null });
  });

  it('400s POST /roles with a missing name', async () => {
    const res = await request(buildApp()).post('/api/v1/roles').set('Authorization', `Bearer ${adminToken()}`).send({});
    expect(res.status).toBe(400);
    expect(roleService.createRole).not.toHaveBeenCalled();
  });
});

describe('GET /permissions', () => {
  it('401s with no token', async () => {
    const res = await request(buildApp()).get('/api/v1/permissions');
    expect(res.status).toBe(401);
  });

  it('200s with a valid Admin token', async () => {
    const res = await request(buildApp()).get('/api/v1/permissions').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ permissionId: 1, name: 'PRODUCT_MANAGE' }]);
  });
});

describe('POST /roles/:id/permissions', () => {
  it('401s with no token', async () => {
    const res = await request(buildApp()).post('/api/v1/roles/1/permissions').send({ permissionIds: [1] });
    expect(res.status).toBe(401);
    expect(roleService.assignPermissionsToRole).not.toHaveBeenCalled();
  });

  it('200s with a valid Admin token and a valid body', async () => {
    const res = await request(buildApp())
      .post('/api/v1/roles/1/permissions')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ permissionIds: [1] });
    expect(res.status).toBe(200);
    expect(roleService.assignPermissionsToRole).toHaveBeenCalledWith(1, [1], { actorType: 'OWNER_ADMIN', actorId: null });
  });

  it('400s with an empty permissionIds array', async () => {
    const res = await request(buildApp())
      .post('/api/v1/roles/1/permissions')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ permissionIds: [] });
    expect(res.status).toBe(400);
    expect(roleService.assignPermissionsToRole).not.toHaveBeenCalled();
  });
});
