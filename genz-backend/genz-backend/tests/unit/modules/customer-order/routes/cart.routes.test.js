/**
 * cart.routes.test.js
 * Contract-level check: every Cart route requires a valid Customer JWT
 * (Cart is customer-authenticated-only per the resolved guest-cart-
 * persistence decision — see cart.routes.js).
 */

jest.mock('../../../../../src/modules/customer-order/services/cart.service', () => ({
  getCart: jest.fn().mockResolvedValue({ cartId: 1, items: [] }),
  addItem: jest.fn().mockResolvedValue({ cartId: 1, items: [] }),
  updateItemQuantity: jest.fn().mockResolvedValue({ cartId: 1, items: [] }),
  removeItem: jest.fn().mockResolvedValue({ cartId: 1, items: [] }),
}));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const config = require('../../../../../src/config/env.config');
const cartService = require('../../../../../src/modules/customer-order/services/cart.service');
const cartRoutes = require('../../../../../src/modules/customer-order/routes/cart.routes');
const errorHandler = require('../../../../../src/shared/middleware/error-handler.middleware');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/cart', cartRoutes);
  app.use(errorHandler);
  return app;
}

function customerToken(customerId = 10) {
  return jwt.sign({ customerId }, config.customerAuth.jwtSecret, { expiresIn: '1h' });
}

describe('Cart routes — auth gating', () => {
  beforeEach(() => jest.clearAllMocks());

  it('401s GET /cart with no Authorization header', async () => {
    const res = await request(buildApp()).get('/api/v1/cart');
    expect(res.status).toBe(401);
    expect(cartService.getCart).not.toHaveBeenCalled();
  });

  it('200s GET /cart with a valid Customer JWT', async () => {
    const res = await request(buildApp()).get('/api/v1/cart').set('Authorization', `Bearer ${customerToken(10)}`);
    expect(res.status).toBe(200);
    expect(cartService.getCart).toHaveBeenCalledWith(10);
  });

  it('401s POST /cart/items with no token', async () => {
    const res = await request(buildApp()).post('/api/v1/cart/items').send({ productId: 1, quantity: 1 });
    expect(res.status).toBe(401);
    expect(cartService.addItem).not.toHaveBeenCalled();
  });

  it('201s POST /cart/items with a valid token and valid body', async () => {
    const res = await request(buildApp())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken(10)}`)
      .send({ productId: 5, quantity: 2 });
    expect(res.status).toBe(201);
    expect(cartService.addItem).toHaveBeenCalledWith(10, { productId: 5, quantity: 2 });
  });

  it('400s POST /cart/items with an invalid body (quantity <= 0)', async () => {
    const res = await request(buildApp())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken(10)}`)
      .send({ productId: 5, quantity: 0 });
    expect(res.status).toBe(400);
    expect(cartService.addItem).not.toHaveBeenCalled();
  });
});
