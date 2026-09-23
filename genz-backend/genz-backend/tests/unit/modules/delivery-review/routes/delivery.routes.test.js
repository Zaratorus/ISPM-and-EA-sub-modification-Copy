/**
 * delivery.routes.test.js
 * Contract-level checks: auth gating (Customer-or-Admin for detail,
 * Admin-only for creation) and the signed courier link that guards the
 * Delivery Person routes (GET/PATCH /deliveries/:id/courier...).
 */

jest.mock('../../../../../src/modules/delivery-review/services/delivery.service', () => ({
  getDeliveryById: jest.fn().mockResolvedValue({ deliveryId: 1, orderId: 100, status: 'ASSIGNED' }),
  getDeliveryByOrderId: jest.fn().mockResolvedValue({ deliveryId: 1, orderId: 100, status: 'ASSIGNED' }),
  createDelivery: jest.fn().mockResolvedValue({ deliveryId: 1, orderId: 100, status: 'ASSIGNED' }),
  assertCustomerOwnsDelivery: jest.fn().mockResolvedValue(undefined),
  advanceStatus: jest.fn().mockResolvedValue({ deliveryId: 1, orderId: 100, status: 'PICKED_UP' }),
  toCourierDelivery: jest.fn((d) => ({ courierView: true, deliveryId: d.deliveryId, status: d.status })),
}));

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const config = require('../../../../../src/config/env.config');
const ApiError = require('../../../../../src/shared/utils/ApiError');
const { createCourierToken } = require('../../../../../src/shared/utils/courier-link');
const deliveryService = require('../../../../../src/modules/delivery-review/services/delivery.service');
const deliveryRoutes = require('../../../../../src/modules/delivery-review/routes/delivery.routes');
const errorHandler = require('../../../../../src/shared/middleware/error-handler.middleware');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/deliveries', deliveryRoutes);
  app.use(errorHandler);
  return app;
}

function customerToken(customerId = 10) {
  return jwt.sign({ customerId }, config.customerAuth.jwtSecret, { expiresIn: '1h' });
}
function adminToken() {
  return jwt.sign({ type: 'OWNER_ADMIN' }, config.adminAccessKey.sessionJwtSecret, { expiresIn: '1h' });
}

function courierGet(id, token) {
  const req = request(buildApp()).get(`/api/v1/deliveries/${id}/courier`);
  return token === undefined ? req : req.set('X-Courier-Token', token);
}
function courierPatch(id, token, status = 'PICKED_UP') {
  const req = request(buildApp()).patch(`/api/v1/deliveries/${id}/courier/status`);
  return (token === undefined ? req : req.set('X-Courier-Token', token)).send({ status });
}
// Replaces one character with a different base64url character.
function alterChar(token, index) {
  const replacement = token[index] === 'A' ? 'B' : 'A';
  return token.slice(0, index) + replacement + token.slice(index + 1);
}

const TOKEN_1 = createCourierToken(1);

describe('GET /deliveries/:id — Customer (own) / Admin', () => {
  beforeEach(() => jest.clearAllMocks());

  it('401s with no token', async () => {
    const res = await request(buildApp()).get('/api/v1/deliveries/1');
    expect(res.status).toBe(401);
  });

  it('200s with a Customer token, checks ownership, and never includes the courier link', async () => {
    const res = await request(buildApp()).get('/api/v1/deliveries/1').set('Authorization', `Bearer ${customerToken(10)}`);
    expect(res.status).toBe(200);
    expect(deliveryService.assertCustomerOwnsDelivery).toHaveBeenCalledWith(
      { deliveryId: 1, orderId: 100, status: 'ASSIGNED' },
      10
    );
    expect(res.body.data.courierToken).toBeUndefined();
    expect(res.body.data.courierPath).toBeUndefined();
  });

  it('200s with an Admin token, skips the ownership check, and includes the courier link', async () => {
    const res = await request(buildApp()).get('/api/v1/deliveries/1').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(deliveryService.assertCustomerOwnsDelivery).not.toHaveBeenCalled();
    expect(res.body.data.courierToken).toBe(TOKEN_1);
    expect(res.body.data.courierPath).toBe(`/delivery-tracking/1?token=${TOKEN_1}`);
  });
});

describe('Delivery Person routes — a signed courier link is required', () => {
  beforeEach(() => jest.clearAllMocks());

  it('1. GET .../courier 401s COURIER_LINK_REQUIRED with no courier token', async () => {
    const res = await courierGet(1);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('COURIER_LINK_REQUIRED');
    expect(deliveryService.getDeliveryById).not.toHaveBeenCalled();
  });

  it('1b. an empty courier token header is treated as missing', async () => {
    const res = await courierGet(1, '');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('COURIER_LINK_REQUIRED');
  });

  it('2/7. GET .../courier 200s with the valid token for delivery 1 and returns the courier view of delivery 1', async () => {
    const res = await courierGet(1, TOKEN_1);
    expect(res.status).toBe(200);
    expect(deliveryService.getDeliveryById).toHaveBeenCalledWith(1);
    expect(deliveryService.toCourierDelivery).toHaveBeenCalledWith({ deliveryId: 1, orderId: 100, status: 'ASSIGNED' });
    expect(res.body.data).toEqual({ courierView: true, deliveryId: 1, status: 'ASSIGNED' });
  });

  it('7b. a valid token for another delivery reads that delivery only', async () => {
    const res = await courierGet(7, createCourierToken(7));
    expect(res.status).toBe(200);
    expect(deliveryService.getDeliveryById).toHaveBeenCalledWith(7);
  });

  it('3. rejects a random token', async () => {
    const res = await courierGet(1, crypto.randomBytes(32).toString('base64url'));
    expect(res.status).toBe(401);
    expect(res.body.error).toEqual({ code: 'INVALID_COURIER_LINK', message: 'This courier link is not valid for this delivery.' });
    expect(deliveryService.getDeliveryById).not.toHaveBeenCalled();
  });

  it.each([0, 21, 42])('4. rejects a token modified at position %i', async (index) => {
    const res = await courierGet(1, alterChar(TOKEN_1, index));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_COURIER_LINK');
    expect(deliveryService.getDeliveryById).not.toHaveBeenCalled();
  });

  it.each([
    ['extra character', `${TOKEN_1}A`],
    ['missing character', TOKEN_1.slice(1)],
    ['surrounding text', `x${TOKEN_1}`],
  ])('4b. rejects a token with an %s', async (_label, token) => {
    expect((await courierGet(1, token)).status).toBe(401);
  });

  it("5. rejects delivery 1's token on delivery 2 (GET and PATCH)", async () => {
    const get = await courierGet(2, TOKEN_1);
    const patch = await courierPatch(2, TOKEN_1);
    expect(get.status).toBe(401);
    expect(patch.status).toBe(401);
    expect(deliveryService.getDeliveryById).not.toHaveBeenCalled();
    expect(deliveryService.advanceStatus).not.toHaveBeenCalled();
  });

  it.each(['01', '1abc', '0', '-1', '1.0'])("6. rejects a modified delivery ID %j carrying delivery 1's token", async (id) => {
    const res = await courierGet(id, TOKEN_1);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_COURIER_LINK');
    expect(deliveryService.getDeliveryById).not.toHaveBeenCalled();
  });

  it('8. PATCH .../courier/status advances the intended delivery with a valid token and returns the courier view', async () => {
    const res = await courierPatch(1, TOKEN_1, 'PICKED_UP');
    expect(res.status).toBe(200);
    expect(deliveryService.advanceStatus).toHaveBeenCalledWith(1, 'PICKED_UP');
    expect(deliveryService.toCourierDelivery).toHaveBeenCalledWith({ deliveryId: 1, orderId: 100, status: 'PICKED_UP' });
    expect(res.body.data).toEqual({ courierView: true, deliveryId: 1, status: 'PICKED_UP' });
  });

  it('9. PATCH .../courier/status 401s without a token and never advances', async () => {
    const res = await courierPatch(1, undefined, 'PICKED_UP');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('COURIER_LINK_REQUIRED');
    expect(deliveryService.advanceStatus).not.toHaveBeenCalled();
  });

  it('9b. an unauthenticated PATCH is rejected before its body is validated (401, not 400)', async () => {
    const res = await courierPatch(1, undefined, 'NOT_A_STATUS');
    expect(res.status).toBe(401);
  });

  it('10. with a valid token, an out-of-enum status still 400s (e.g. ASSIGNED is a starting state, not a target)', async () => {
    const res = await courierPatch(1, TOKEN_1, 'ASSIGNED');
    expect(res.status).toBe(400);
    expect(deliveryService.advanceStatus).not.toHaveBeenCalled();
  });

  it("10b. with a valid token, the service's 422 for an out-of-sequence transition is passed through unchanged", async () => {
    deliveryService.advanceStatus.mockRejectedValueOnce(
      ApiError.unprocessable('INVALID_DELIVERY_TRANSITION', 'Delivery 1 cannot move from ASSIGNED to DELIVERED.')
    );
    const res = await courierPatch(1, TOKEN_1, 'DELIVERED');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_DELIVERY_TRANSITION');
  });

  it('the HEADING_TO_STORE and ARRIVED stages are accepted with a valid token', async () => {
    expect((await courierPatch(1, TOKEN_1, 'HEADING_TO_STORE')).status).toBe(200);
    expect((await courierPatch(1, TOKEN_1, 'ARRIVED')).status).toBe(200);
  });

  it('a Customer or Admin session token is not a courier link', async () => {
    const asCustomer = await request(buildApp())
      .get('/api/v1/deliveries/1/courier')
      .set('Authorization', `Bearer ${customerToken(10)}`);
    const asAdmin = await request(buildApp())
      .get('/api/v1/deliveries/1/courier')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(asCustomer.status).toBe(401);
    expect(asAdmin.status).toBe(401);
  });
});

describe('PATCH /deliveries/:id/status — REMOVED (Admin no longer advances delivery status at all)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('404s — no such route exists any more', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/deliveries/1/status')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ status: 'PICKED_UP' });
    expect(res.status).toBe(404);
    expect(deliveryService.advanceStatus).not.toHaveBeenCalled();
  });
});

describe('POST /deliveries — Admin only', () => {
  beforeEach(() => jest.clearAllMocks());

  it('401s with no token', async () => {
    const res = await request(buildApp()).post('/api/v1/deliveries').send({ orderId: 100 });
    expect(res.status).toBe(401);
    expect(deliveryService.createDelivery).not.toHaveBeenCalled();
  });

  it('401s with a Customer token (not an Admin session)', async () => {
    const res = await request(buildApp())
      .post('/api/v1/deliveries')
      .set('Authorization', `Bearer ${customerToken(10)}`)
      .send({ orderId: 100 });
    expect(res.status).toBe(401);
    expect(deliveryService.createDelivery).not.toHaveBeenCalled();
  });

  it('11. 201s with a valid Admin token and a valid body', async () => {
    const res = await request(buildApp())
      .post('/api/v1/deliveries')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ orderId: 100 });
    expect(res.status).toBe(201);
    expect(deliveryService.createDelivery).toHaveBeenCalledWith(
      { orderId: 100 },
      { actorType: 'OWNER_ADMIN', actorId: null }
    );
  });

  it('11b. the 201 response includes a courier link that works for the new delivery only', async () => {
    const res = await request(buildApp())
      .post('/api/v1/deliveries')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ orderId: 100 });
    expect(res.body.data).toMatchObject({ deliveryId: 1, courierToken: TOKEN_1, courierPath: `/delivery-tracking/1?token=${TOKEN_1}` });

    expect((await courierGet(1, res.body.data.courierToken)).status).toBe(200);
    expect((await courierGet(2, res.body.data.courierToken)).status).toBe(401);
  });

  it('201s and passes deliveryPersonReference through when provided', async () => {
    const res = await request(buildApp())
      .post('/api/v1/deliveries')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ orderId: 100, deliveryPersonReference: 'Kasun' });
    expect(res.status).toBe(201);
    expect(deliveryService.createDelivery).toHaveBeenCalledWith(
      { orderId: 100, deliveryPersonReference: 'Kasun' },
      { actorType: 'OWNER_ADMIN', actorId: null }
    );
  });

  it('400s when orderId is missing', async () => {
    const res = await request(buildApp()).post('/api/v1/deliveries').set('Authorization', `Bearer ${adminToken()}`).send({});
    expect(res.status).toBe(400);
    expect(deliveryService.createDelivery).not.toHaveBeenCalled();
  });
});
