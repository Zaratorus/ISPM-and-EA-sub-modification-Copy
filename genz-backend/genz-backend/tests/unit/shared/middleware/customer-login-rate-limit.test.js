/**
 * customer-login-rate-limit.test.js
 * Failed-attempt limiter on POST /auth/customer/login: after the configured
 * number of failures (default 5) per IP + normalised contactInfo within the
 * window (default 15 min), further attempts get 429 with Retry-After.
 *
 * Runs the real customer-auth routes (validator -> limiter -> controller ->
 * service) with bcrypt and the repository mocked, as in
 * customer-auth.routes.test.js. Time is controlled by mocking Date.now, so no
 * test waits for the real window. The test app trusts X-Forwarded-For only so
 * a test can choose req.ip.
 */

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
}));
jest.mock('../../../../src/modules/customer-order/repositories/customer.repository', () => ({
  findByContactInfo: jest.fn(),
  create: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const bcrypt = require('bcrypt');
const config = require('../../../../src/config/env.config');
const customerRepository = require('../../../../src/modules/customer-order/repositories/customer.repository');
const customerAuthRoutes = require('../../../../src/modules/customer-order/routes/customer-auth.routes');
const errorHandler = require('../../../../src/shared/middleware/error-handler.middleware');
const {
  resetLoginAttempts,
  trackedKeyCount,
} = require('../../../../src/shared/middleware/customer-login-rate-limit.middleware');

const MAX = config.customerAuth.loginRateLimitMaxAttempts;
const WINDOW_MS = config.customerAuth.loginRateLimitWindowMs;
const LOGIN = '/api/v1/auth/customer/login';
const JANE = { customer_id: 7, name: 'Jane', contact_info: 'jane@example.com', credentials_reference: 'hash', status: 'ACTIVE' };

function buildApp() {
  const app = express();
  app.set('trust proxy', true); // test-only: lets each request choose req.ip via X-Forwarded-For
  app.use(express.json());
  app.use('/api/v1/auth/customer', customerAuthRoutes);
  app.use(errorHandler);
  return app;
}

let app;
let now;
let dateSpy;
const advance = (ms) => {
  now += ms;
};

function attempt({ contactInfo = 'jane@example.com', password = 'wrong-password', ip = '203.0.113.1' } = {}) {
  return request(app).post(LOGIN).set('X-Forwarded-For', ip).send({ contactInfo, password });
}

async function failTimes(n, opts) {
  for (let i = 0; i < n; i += 1) {
    const res = await attempt(opts);
    expect(res.status).toBe(401);
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  resetLoginAttempts();
  now = Date.UTC(2026, 0, 1);
  dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
  customerRepository.findByContactInfo.mockResolvedValue([JANE]);
  bcrypt.compare.mockImplementation(async (password) => password === 'correct-password');
  app = buildApp();
});

afterEach(() => dateSpy.mockRestore());

describe('customer login rate limit — allowed attempts', () => {
  it('uses the documented defaults (5 attempts, 15 minutes)', () => {
    expect(MAX).toBe(5);
    expect(WINDOW_MS).toBe(15 * 60 * 1000);
  });

  it('allows the first failed attempt (normal 401, no Retry-After)', async () => {
    const res = await attempt();
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(res.headers['retry-after']).toBeUndefined();
  });

  it('allows five failed attempts, each checked against the password', async () => {
    await failTimes(MAX);
    expect(bcrypt.compare).toHaveBeenCalledTimes(MAX);
  });
});

describe('customer login rate limit — blocking', () => {
  it('answers the sixth attempt with 429 TOO_MANY_LOGIN_ATTEMPTS', async () => {
    await failTimes(MAX);
    const res = await attempt();
    expect(res.status).toBe(429);
    expect(res.body.error).toEqual({
      code: 'TOO_MANY_LOGIN_ATTEMPTS',
      message: 'Too many failed login attempts. Please try again later.',
    });
  });

  it('does not call the login lookup or password check while blocked, even with the correct password', async () => {
    await failTimes(MAX);
    jest.clearAllMocks();
    const res = await attempt({ password: 'correct-password' });
    expect(res.status).toBe(429);
    expect(customerRepository.findByContactInfo).not.toHaveBeenCalled();
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(res.body.data).toBeUndefined();
  });

  it('sets Retry-After to the seconds remaining in the window', async () => {
    await failTimes(MAX);
    expect((await attempt()).headers['retry-after']).toBe(String(WINDOW_MS / 1000));

    advance(5 * 60 * 1000);
    expect((await attempt()).headers['retry-after']).toBe(String(WINDOW_MS / 1000 - 5 * 60));
  });
});

describe('customer login rate limit — what counts', () => {
  it('a successful login resets the failed-attempt counter', async () => {
    await failTimes(MAX - 1);
    expect((await attempt({ password: 'correct-password' })).status).toBe(200);

    await failTimes(MAX); // a fresh allowance of five
    expect((await attempt()).status).toBe(429);
  });

  it('a 400 validation error does not count as a failed attempt', async () => {
    for (let i = 0; i < MAX + 2; i += 1) {
      const res = await request(app).post(LOGIN).set('X-Forwarded-For', '203.0.113.1').send({ contactInfo: 'jane@example.com' });
      expect(res.status).toBe(400);
    }
    expect(trackedKeyCount()).toBe(0);
    expect((await attempt()).status).toBe(401);
  });

  it('a different contactInfo does not share the counter', async () => {
    await failTimes(MAX);
    expect((await attempt({ contactInfo: 'someone.else@example.com' })).status).toBe(401);
  });

  it('normalises contactInfo (trim + lowercase) for the key', async () => {
    await failTimes(MAX);
    expect((await attempt({ contactInfo: '  JANE@Example.COM  ' })).status).toBe(429);
  });

  it('a different IP does not share the counter', async () => {
    await failTimes(MAX, { ip: '203.0.113.1' });
    expect((await attempt({ ip: '198.51.100.7' })).status).toBe(401);
    expect((await attempt({ ip: '203.0.113.1' })).status).toBe(429);
  });

  it('does not affect other endpoints such as registration', async () => {
    await failTimes(MAX);
    const res = await request(app)
      .post('/api/v1/auth/customer/register')
      .set('X-Forwarded-For', '203.0.113.1')
      .send({ name: 'Jane', contactInfo: 'jane@example.com', password: 'Password123!' });
    expect(res.status).toBe(409); // normal register behaviour, not 429
  });
});

describe('customer login rate limit — expiry and cleanup', () => {
  it('unblocks once the configured window has passed', async () => {
    await failTimes(MAX);

    advance(WINDOW_MS - 1000);
    const stillBlocked = await attempt();
    expect(stillBlocked.status).toBe(429);
    expect(stillBlocked.headers['retry-after']).toBe('1');

    advance(1001);
    expect((await attempt()).status).toBe(401);
  });

  it('removes expired entries so the store does not grow indefinitely', async () => {
    await failTimes(2, { contactInfo: 'a@example.com' });
    await failTimes(1, { contactInfo: 'b@example.com', ip: '198.51.100.7' });
    expect(trackedKeyCount()).toBe(2);

    advance(WINDOW_MS + 60 * 1000 + 1);
    // Any later login request triggers the sweep; a success adds no entry of its own.
    expect((await attempt({ contactInfo: 'c@example.com', password: 'correct-password' })).status).toBe(200);
    expect(trackedKeyCount()).toBe(0);
  });
});
