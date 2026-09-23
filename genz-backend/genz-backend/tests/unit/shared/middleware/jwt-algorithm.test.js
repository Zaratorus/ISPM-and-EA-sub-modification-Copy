/**
 * jwt-algorithm.test.js
 * JWT security: customer and admin tokens are signed with HS256, and every
 * verification point accepts HS256 only (HS384, HS512 and alg:none are
 * rejected; a wrong secret and an expired token stay rejected).
 *
 * Covers both token issuers and all three auth middleware files, including
 * the optional variants. Secrets are read from config (tests/setup-env.js or
 * the local .env) and never hard-coded here. bcrypt and the repositories are
 * mocked, as in customer.service.test.js, so no native binding or DB is used.
 */

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));
jest.mock('../../../../src/modules/customer-order/repositories/customer.repository', () => ({
  findByContactInfo: jest.fn(),
  create: jest.fn(),
}));
jest.mock('../../../../src/modules/store-administration/repositories/admin-access-key.repository', () => ({
  getHash: jest.fn(),
  setHash: jest.fn(),
}));

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const config = require('../../../../src/config/env.config');
const adminAccessKeyRepository = require('../../../../src/modules/store-administration/repositories/admin-access-key.repository');
const { issueCustomerSessionToken } = require('../../../../src/modules/customer-order/services/customer.service');
const { validateAccessKey } = require('../../../../src/modules/store-administration/services/admin-access-key.service');
const { authCustomer, authCustomerOptional } = require('../../../../src/shared/middleware/auth-customer.middleware');
const authAdminAccessKey = require('../../../../src/shared/middleware/auth-admin-access-key.middleware');
const authCustomerOrAdmin = require('../../../../src/shared/middleware/auth-customer-or-admin.middleware');

const CUSTOMER_SECRET = config.customerAuth.jwtSecret;
const ADMIN_SECRET = config.adminAccessKey.sessionJwtSecret;
const CUSTOMER_PAYLOAD = { customerId: 42 };
const ADMIN_PAYLOAD = { type: 'OWNER_ADMIN' };

function sign(payload, secret, algorithm) {
  return jwt.sign(payload, secret, { algorithm, expiresIn: '5m' });
}

function unsignedToken(payload) {
  const part = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${part({ alg: 'none', typ: 'JWT' })}.${part(payload)}.`;
}

function expiredToken(payload, secret) {
  return jwt.sign({ ...payload, exp: Math.floor(Date.now() / 1000) - 60 }, secret, { algorithm: 'HS256' });
}

// Every token here carries the right payload; only the algorithm, secret or expiry is wrong.
function rejectedCases(payload, secret) {
  return [
    ['HS384', sign(payload, secret, 'HS384')],
    ['HS512', sign(payload, secret, 'HS512')],
    ['alg:none', unsignedToken(payload)],
    ['wrong secret', sign(payload, 'not-the-configured-secret', 'HS256')],
    ['expired', expiredToken(payload, secret)],
  ];
}
const CUSTOMER_REJECTED = rejectedCases(CUSTOMER_PAYLOAD, CUSTOMER_SECRET);
const ADMIN_REJECTED = rejectedCases(ADMIN_PAYLOAD, ADMIN_SECRET);

function run(middleware, token) {
  const req = { headers: { authorization: `Bearer ${token}` } };
  const next = jest.fn();
  middleware(req, {}, next);
  return { req, next };
}

const headerAlg = (token) => jwt.decode(token, { complete: true }).header.alg;

beforeEach(() => jest.clearAllMocks());

describe('test fixtures', () => {
  it('really use the algorithm each case is named after', () => {
    for (const cases of [CUSTOMER_REJECTED, ADMIN_REJECTED]) {
      const byName = Object.fromEntries(cases);
      expect(headerAlg(byName.HS384)).toBe('HS384');
      expect(headerAlg(byName.HS512)).toBe('HS512');
      expect(headerAlg(byName['alg:none'])).toBe('none');
    }
  });
});

describe('token creation uses HS256', () => {
  it('issueCustomerSessionToken() signs with HS256 and keeps the { customerId } payload', () => {
    const token = issueCustomerSessionToken(42);
    expect(headerAlg(token)).toBe('HS256');
    expect(jwt.verify(token, CUSTOMER_SECRET, { algorithms: ['HS256'] }).customerId).toBe(42);
  });

  it("validateAccessKey() signs the admin session with HS256 and keeps the { type: 'OWNER_ADMIN' } payload", async () => {
    adminAccessKeyRepository.getHash.mockResolvedValue('stored-hash');
    bcrypt.compare.mockResolvedValue(true);
    const token = await validateAccessKey('correct-key', '203.0.113.10');
    expect(headerAlg(token)).toBe('HS256');
    expect(jwt.verify(token, ADMIN_SECRET, { algorithms: ['HS256'] }).type).toBe('OWNER_ADMIN');
  });
});

describe('authCustomer — HS256 only', () => {
  it('accepts a valid HS256 customer token', () => {
    const { req, next } = run(authCustomer, sign(CUSTOMER_PAYLOAD, CUSTOMER_SECRET, 'HS256'));
    expect(next).toHaveBeenCalledWith();
    expect(req.customer).toEqual({ customerId: 42 });
  });

  it.each(CUSTOMER_REJECTED)('rejects a %s token with 401 INVALID_TOKEN', (_name, token) => {
    const { req, next } = run(authCustomer, token);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, code: 'INVALID_TOKEN' }));
    expect(req.customer).toBeUndefined();
  });
});

describe('authCustomerOptional — HS256 only', () => {
  it('attaches the customer for a valid HS256 token', () => {
    const { req, next } = run(authCustomerOptional, sign(CUSTOMER_PAYLOAD, CUSTOMER_SECRET, 'HS256'));
    expect(next).toHaveBeenCalledWith();
    expect(req.customer).toEqual({ customerId: 42 });
  });

  it.each(CUSTOMER_REJECTED)('ignores a %s token (no customer attached, request continues)', (_name, token) => {
    const { req, next } = run(authCustomerOptional, token);
    expect(next).toHaveBeenCalledWith();
    expect(req.customer).toBeUndefined();
  });
});

describe('authAdminAccessKey — HS256 only', () => {
  it('accepts a valid HS256 admin token', () => {
    const { req, next } = run(authAdminAccessKey, sign(ADMIN_PAYLOAD, ADMIN_SECRET, 'HS256'));
    expect(next).toHaveBeenCalledWith();
    expect(req.adminSession).toEqual({ type: 'OWNER_ADMIN' });
  });

  it.each(ADMIN_REJECTED)('rejects a %s token with 401 INVALID_TOKEN', (_name, token) => {
    const { req, next } = run(authAdminAccessKey, token);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, code: 'INVALID_TOKEN' }));
    expect(req.adminSession).toBeUndefined();
  });
});

describe('authAdminAccessKey.optional — HS256 only', () => {
  it('attaches the admin session for a valid HS256 token', () => {
    const { req, next } = run(authAdminAccessKey.optional, sign(ADMIN_PAYLOAD, ADMIN_SECRET, 'HS256'));
    expect(next).toHaveBeenCalledWith();
    expect(req.adminSession).toEqual({ type: 'OWNER_ADMIN' });
  });

  it.each(ADMIN_REJECTED)('ignores a %s token (no admin session attached, request continues)', (_name, token) => {
    const { req, next } = run(authAdminAccessKey.optional, token);
    expect(next).toHaveBeenCalledWith();
    expect(req.adminSession).toBeUndefined();
  });
});

describe('authCustomerOrAdmin — HS256 only', () => {
  it('accepts a valid HS256 admin token', () => {
    const { req, next } = run(authCustomerOrAdmin, sign(ADMIN_PAYLOAD, ADMIN_SECRET, 'HS256'));
    expect(next).toHaveBeenCalledWith();
    expect(req.adminSession).toEqual({ type: 'OWNER_ADMIN' });
    expect(req.customer).toBeUndefined();
  });

  it('accepts a valid HS256 customer token', () => {
    const { req, next } = run(authCustomerOrAdmin, sign(CUSTOMER_PAYLOAD, CUSTOMER_SECRET, 'HS256'));
    expect(next).toHaveBeenCalledWith();
    expect(req.customer).toEqual({ customerId: 42 });
    expect(req.adminSession).toBeUndefined();
  });

  it.each([...ADMIN_REJECTED.map(([n, t]) => [`admin ${n}`, t]), ...CUSTOMER_REJECTED.map(([n, t]) => [`customer ${n}`, t])])(
    'rejects a %s token with 401 INVALID_TOKEN',
    (_name, token) => {
      const { req, next } = run(authCustomerOrAdmin, token);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, code: 'INVALID_TOKEN' }));
      expect(req.adminSession).toBeUndefined();
      expect(req.customer).toBeUndefined();
    }
  );
});
