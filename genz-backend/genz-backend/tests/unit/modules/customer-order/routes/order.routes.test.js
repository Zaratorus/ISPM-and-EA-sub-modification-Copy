/**
 * order.routes.test.js
 * Contract-level checks: auth gating per endpoint (Customer-only for
 * checkout, Customer-or-Admin for listing/detail/cancel, Admin-only for
 * confirm/status), and that the controller builds the right `requester`
 * shape for cancelOrder() depending on who is calling.
 */

jest.mock('../../../../../src/modules/customer-order/services/order.service', () => ({
  checkout: jest.fn().mockResolvedValue({ orderId: 1, status: 'PENDING', items: [] }),
  listCustomerOrders: jest.fn().mockResolvedValue({ data: [], meta: { page: 1, limit: 20, total: 0 } }),
  listAllOrders: jest.fn().mockResolvedValue({ data: [], meta: { page: 1, limit: 20, total: 0 } }),
  getOrderDetail: jest.fn().mockResolvedValue({ orderId: 1, customerId: 10, status: 'PENDING', items: [] }),
  confirmOrder: jest.fn().mockResolvedValue({ orderId: 1, status: 'CONFIRMED', items: [] }),
  advanceStatus: jest.fn().mockResolvedValue({ orderId: 1, status: 'PROCESSING', items: [] }),
  cancelOrder: jest.fn().mockResolvedValue({ orderId: 1, status: 'CANCELLED', items: [] }),
}));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const config = require('../../../../../src/config/env.config');
const orderService = require('../../../../../src/modules/customer-order/services/order.service');
const orderRoutes = require('../../../../../src/modules/customer-order/routes/order.routes');
const errorHandler = require('../../../../../src/shared/middleware/error-handler.middleware');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/orders', orderRoutes);
  app.use(errorHandler);
  return app;
}

function customerToken(customerId = 10) {
  return jwt.sign({ customerId }, config.customerAuth.jwtSecret, { expiresIn: '1h' });
}
function adminToken() {
  return jwt.sign({ type: 'OWNER_ADMIN' }, config.adminAccessKey.sessionJwtSecret, { expiresIn: '1h' });
}

describe('POST /orders — Customer only', () => {
  beforeEach(() => jest.clearAllMocks());

  it('401s with no token', async () => {
    const res = await request(buildApp()).post('/api/v1/orders');
    expect(res.status).toBe(401);
    expect(orderService.checkout).not.toHaveBeenCalled();
  });

  it('201s with a valid Customer token and a deliveryAddress in the body', async () => {
    const res = await request(buildApp())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken(10)}`)
      .send({ deliveryAddress: '123 Main St, Colombo' });
    expect(res.status).toBe(201);
    expect(orderService.checkout).toHaveBeenCalledWith(10, { deliveryAddress: '123 Main St, Colombo' });
  });

  it('400s when deliveryAddress is missing from the body', async () => {
    const res = await request(buildApp()).post('/api/v1/orders').set('Authorization', `Bearer ${customerToken(10)}`).send({});
    expect(res.status).toBe(400);
    expect(orderService.checkout).not.toHaveBeenCalled();
  });
});

describe('GET /orders — Customer (own) / Admin (all)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('401s with no token', async () => {
    const res = await request(buildApp()).get('/api/v1/orders');
    expect(res.status).toBe(401);
  });

  it('scopes to the customer\'s own orders with a Customer token', async () => {
    const res = await request(buildApp()).get('/api/v1/orders').set('Authorization', `Bearer ${customerToken(10)}`);
    expect(res.status).toBe(200);
    expect(orderService.listCustomerOrders).toHaveBeenCalledWith(10, expect.any(Object));
    expect(orderService.listAllOrders).not.toHaveBeenCalled();
  });

  it('lists all orders with an Admin token', async () => {
    const res = await request(buildApp()).get('/api/v1/orders').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(orderService.listAllOrders).toHaveBeenCalled();
    expect(orderService.listCustomerOrders).not.toHaveBeenCalled();
  });
});

describe('PATCH /orders/:id/confirm — Admin only', () => {
  beforeEach(() => jest.clearAllMocks());

  it('401s with a Customer token (not an Admin session)', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/orders/1/confirm')
      .set('Authorization', `Bearer ${customerToken(10)}`);
    expect(res.status).toBe(401);
    expect(orderService.confirmOrder).not.toHaveBeenCalled();
  });

  it('200s with a valid Admin token', async () => {
    const res = await request(buildApp()).patch('/api/v1/orders/1/confirm').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(orderService.confirmOrder).toHaveBeenCalledWith(1, { actorType: 'OWNER_ADMIN', actorId: null });
  });
});

describe('PATCH /orders/:id/status — Admin only', () => {
  beforeEach(() => jest.clearAllMocks());

  it('200s with a valid Admin token and a legal target status', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/orders/1/status')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ status: 'PROCESSING' });
    expect(res.status).toBe(200);
    expect(orderService.advanceStatus).toHaveBeenCalledWith(1, 'PROCESSING', { actorType: 'OWNER_ADMIN', actorId: null });
  });

  it('400s an out-of-enum status value before it ever reaches the service', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/orders/1/status')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ status: 'DELIVERED' });
    expect(res.status).toBe(400);
    expect(orderService.advanceStatus).not.toHaveBeenCalled();
  });
});

describe('PATCH /orders/:id/cancel — Customer (own) / Admin (any stage), resolved OPEN decision', () => {
  beforeEach(() => jest.clearAllMocks());

  it('401s with no token', async () => {
    const res = await request(buildApp()).patch('/api/v1/orders/1/cancel');
    expect(res.status).toBe(401);
    expect(orderService.cancelOrder).not.toHaveBeenCalled();
  });

  it('200s with a Customer token, building a CUSTOMER-shaped requester', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/orders/1/cancel')
      .set('Authorization', `Bearer ${customerToken(10)}`);
    expect(res.status).toBe(200);
    expect(orderService.cancelOrder).toHaveBeenCalledWith(1, {
      type: 'CUSTOMER',
      customerId: 10,
      actorType: 'CUSTOMER',
      actorId: 10,
    });
  });

  it('200s with an Admin token, building an ADMIN-shaped requester', async () => {
    const res = await request(buildApp()).patch('/api/v1/orders/1/cancel').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(orderService.cancelOrder).toHaveBeenCalledWith(1, {
      type: 'ADMIN',
      actorType: 'OWNER_ADMIN',
      actorId: null,
    });
  });
});
