/**
 * password-reset.routes.test.js
 * POST /auth/customer/password/{forgot,verify-otp,reset}: public (no token of
 * any kind), validated before the service, and the service's generic answers
 * and 400 INVALID_OR_EXPIRED_CODE passed through unchanged. An Authorization
 * header is ignored, so an admin session cannot bypass the code check.
 */

jest.mock('bcrypt', () => ({ hash: jest.fn(), compare: jest.fn() }));
jest.mock('../../../../../src/modules/customer-order/repositories/customer.repository', () => ({
  findByContactInfo: jest.fn(),
  create: jest.fn(),
}));
jest.mock('../../../../../src/modules/customer-order/services/password-reset.service', () => ({
  requestPasswordReset: jest.fn(),
  verifyOtp: jest.fn(),
  resetPassword: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const config = require('../../../../../src/config/env.config');
const ApiError = require('../../../../../src/shared/utils/ApiError');
const passwordResetService = require('../../../../../src/modules/customer-order/services/password-reset.service');
const customerAuthRoutes = require('../../../../../src/modules/customer-order/routes/customer-auth.routes');
const errorHandler = require('../../../../../src/shared/middleware/error-handler.middleware');

const GENERIC = 'If an account with that email exists, a verification code has been sent.';
const BASE = '/api/v1/auth/customer/password';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth/customer', customerAuthRoutes);
  app.use(errorHandler);
  return app;
}
const adminToken = () => jwt.sign({ type: 'OWNER_ADMIN' }, config.adminAccessKey.sessionJwtSecret, { algorithm: 'HS256', expiresIn: '5m' });
const customerToken = () => jwt.sign({ customerId: 10 }, config.customerAuth.jwtSecret, { algorithm: 'HS256', expiresIn: '5m' });
const post = (path, body, token) => {
  const req = request(buildApp()).post(`${BASE}/${path}`);
  return (token ? req.set('Authorization', `Bearer ${token}`) : req).send(body);
};
const RESET_BODY = { email: 'jane@example.com', otp: '004821', newPassword: 'NewPass123!', confirmPassword: 'NewPass123!' };

beforeEach(() => {
  jest.clearAllMocks();
  passwordResetService.requestPasswordReset.mockResolvedValue({ message: GENERIC });
  passwordResetService.verifyOtp.mockResolvedValue({ verified: true });
  passwordResetService.resetPassword.mockResolvedValue({ message: 'Password updated. Please log in.' });
});

describe('POST /password/forgot — public', () => {
  it('200s with the generic answer and no token at all; the email is normalised first', async () => {
    const res = await post('forgot', { email: '  Jane@Example.com ' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { message: GENERIC } });
    expect(passwordResetService.requestPasswordReset).toHaveBeenCalledWith('jane@example.com');
  });

  it('gives exactly the same response for an unknown address (the service decides; nothing differs at the route)', async () => {
    const known = await post('forgot', { email: 'jane@example.com' });
    const unknown = await post('forgot', { email: 'nobody@example.com' });
    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
  });

  it('a phone number gets the same generic 200 (the service receives email: null — nothing to look up)', async () => {
    const phone = await post('forgot', { email: '+94771234567' });
    const known = await post('forgot', { email: 'jane@example.com' });
    expect(phone.status).toBe(200);
    expect(phone.body).toEqual(known.body);
    expect(passwordResetService.requestPasswordReset).toHaveBeenNthCalledWith(1, null);
  });

  it.each([
    ['a malformed body', {}],
    ['an invalid email', { email: 'jane@' }],
    ['a non-text email', { email: 12345 }],
  ])('400s VALIDATION_ERROR for %s before the service runs', async (_label, body) => {
    const res = await post('forgot', body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(passwordResetService.requestPasswordReset).not.toHaveBeenCalled();
  });
});

describe('POST /password/verify-otp — public', () => {
  it('200s { verified: true } for a valid code', async () => {
    const res = await post('verify-otp', { email: 'jane@example.com', otp: '004821' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { verified: true } });
    expect(passwordResetService.verifyOtp).toHaveBeenCalledWith('jane@example.com', '004821');
  });

  it("passes the service's 400 INVALID_OR_EXPIRED_CODE through", async () => {
    passwordResetService.verifyOtp.mockRejectedValue(ApiError.badRequest('INVALID_OR_EXPIRED_CODE', 'The code is invalid or has expired.'));
    const res = await post('verify-otp', { email: 'jane@example.com', otp: '999999' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_OR_EXPIRED_CODE');
  });

  it.each([
    ['a numeric JSON code', { email: 'jane@example.com', otp: 4821 }],
    ['a 5-digit code', { email: 'jane@example.com', otp: '12345' }],
    ['letters', { email: 'jane@example.com', otp: 'abcdef' }],
    ['no email', { otp: '123456' }],
  ])('400s VALIDATION_ERROR for %s', async (_label, body) => {
    const res = await post('verify-otp', body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(passwordResetService.verifyOtp).not.toHaveBeenCalled();
  });
});

describe('POST /password/reset — public', () => {
  it('200s with the success message and no token; the confirmation is not forwarded', async () => {
    const res = await post('reset', RESET_BODY);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { message: 'Password updated. Please log in.' } });
    expect(res.body.data).not.toHaveProperty('token');
    expect(passwordResetService.resetPassword).toHaveBeenCalledWith({ email: 'jane@example.com', otp: '004821', newPassword: 'NewPass123!' });
  });

  it.each([
    ['a confirmation mismatch', { ...RESET_BODY, confirmPassword: 'Other123!' }],
    ['a weak password', { ...RESET_BODY, newPassword: 'password123', confirmPassword: 'password123' }],
    ['no code', { ...RESET_BODY, otp: undefined }],
  ])('400s VALIDATION_ERROR for %s', async (_label, body) => {
    const res = await post('reset', body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(passwordResetService.resetPassword).not.toHaveBeenCalled();
  });

  it("passes the service's 400 INVALID_OR_EXPIRED_CODE through", async () => {
    passwordResetService.resetPassword.mockRejectedValue(ApiError.badRequest('INVALID_OR_EXPIRED_CODE', 'The code is invalid or has expired.'));
    const res = await post('reset', RESET_BODY);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_OR_EXPIRED_CODE');
  });

  it('an admin session does not bypass the code check: the request is handled exactly as without a token', async () => {
    passwordResetService.resetPassword.mockRejectedValue(ApiError.badRequest('INVALID_OR_EXPIRED_CODE', 'The code is invalid or has expired.'));
    const asAdmin = await post('reset', RESET_BODY, adminToken());
    const asCustomer = await post('reset', RESET_BODY, customerToken());
    expect(asAdmin.status).toBe(400);
    expect(asCustomer.status).toBe(400);
    expect(passwordResetService.resetPassword).toHaveBeenCalledTimes(2);
    for (const call of passwordResetService.resetPassword.mock.calls) {
      expect(call).toEqual([{ email: 'jane@example.com', otp: '004821', newPassword: 'NewPass123!' }]);
    }
  });
});
