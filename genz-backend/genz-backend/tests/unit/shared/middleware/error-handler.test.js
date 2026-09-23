/**
 * error-handler.test.js
 * The global error handler's handling of request-body errors from
 * express.json(): unparseable JSON -> 400 INVALID_JSON, a body over the
 * parser's limit (default 100kb) -> 413 PAYLOAD_TOO_LARGE, both with fixed
 * messages and nothing from the parser, the body or the stack in the
 * response or the logs. Also checks that every existing mapping is unchanged.
 *
 * Part 1 goes through the real app (src/app.js) with the database mocked, so
 * nothing touches MySQL. Part 2 calls the handler behind a minimal app.
 */

jest.mock('../../../../src/shared/db/connection', () => ({
  pool: { query: jest.fn() },
  withTransaction: jest.fn(),
}));
jest.mock('morgan', () => () => (req, res, next) => next());

const express = require('express');
const request = require('supertest');
const app = require('../../../../src/app');
const ApiError = require('../../../../src/shared/utils/ApiError');
const errorHandler = require('../../../../src/shared/middleware/error-handler.middleware');

const FORGOT = '/api/v1/auth/customer/password/forgot';
const LOGIN = '/api/v1/auth/customer/login';
const INTERNALS = [/Unexpected/i, /SyntaxError/, /JSON\.parse/, /entity\./, /body-parser/, /node_modules/, /\bat \w/, /stack/i, /limit/i, /bytes/i];

function expectNoInternals(res, bodyFragment) {
  for (const pattern of INTERNALS) expect(res.text).not.toMatch(pattern);
  if (bodyFragment) expect(res.text).not.toContain(bodyFragment);
}

let consoleError;
beforeEach(() => {
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => consoleError.mockRestore());

describe('request-body errors through the real app', () => {
  it.each([
    ['a truncated object', '{"email":'],
    ['a trailing comma', '{"contactInfo":"jane@example.com","password":"x",}'],
    ['single quotes', "{'email':'jane@example.com'}"],
  ])('malformed JSON (%s) -> 400 INVALID_JSON with the fixed message', async (_label, body) => {
    const res = await request(app).post(LOGIN).set('Content-Type', 'application/json').send(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { code: 'INVALID_JSON', message: 'Invalid JSON request body.' } });
  });

  it('malformed JSON exposes no parser message, stack or request body, and is not logged', async () => {
    const body = '{"contactInfo":"secret-looking-value@example.com","password":"Hunter2!!",';
    const res = await request(app).post(LOGIN).set('Content-Type', 'application/json').send(body);
    expect(res.status).toBe(400);
    expectNoInternals(res, 'secret-looking-value');
    expect(res.text).not.toContain('Hunter2');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('a body over the 100kb limit -> 413 PAYLOAD_TOO_LARGE with the fixed message', async () => {
    const res = await request(app)
      .post(FORGOT)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'jane@example.com', padding: 'x'.repeat(101 * 1024) }));
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' } });
  });

  it('the 413 exposes no parser internals (sizes, limit, stack) and is not logged', async () => {
    const res = await request(app)
      .post(LOGIN)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ contactInfo: 'jane@example.com', password: 'y'.repeat(120 * 1024) }));
    expect(res.status).toBe(413);
    expectNoInternals(res, 'yyyyyyyy');
    expect(res.text).not.toMatch(/[0-9]{5,}/); // no byte counts
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('a body just under the limit is still parsed and reaches validation as before', async () => {
    const res = await request(app)
      .post(FORGOT)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'not-an-email', padding: 'x'.repeat(90 * 1024) }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('a valid JSON request still works (phone on forgot -> generic 200, no database needed)', async () => {
    const res = await request(app).post(FORGOT).send({ email: '+94771234567' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { message: 'If an account with that email exists, a verification code has been sent.' } });
  });
});

describe('existing behaviour through the real app is unchanged', () => {
  it('validation errors: 400 VALIDATION_ERROR with the field details', async () => {
    const res = await request(app).post(FORGOT).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/^email: /);
  });

  it('authentication errors: 401 AUTH_REQUIRED', async () => {
    const res = await request(app).get('/api/v1/reviews/mine');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: 'AUTH_REQUIRED', message: 'Customer authentication is required for this action.' } });
  });

  it('invalid tokens: 401 INVALID_TOKEN', async () => {
    const res = await request(app).get('/api/v1/reviews/mine').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('unknown routes: 404 NOT_FOUND', async () => {
    const res = await request(app).post('/api/v1/no-such-route').send({ a: 1 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('health check: 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { status: 'ok' } });
  });
});

describe('existing handler mappings are unchanged', () => {
  function appThrowing(err) {
    const mini = express();
    mini.get('/boom', (req, res, next) => next(err));
    mini.use(errorHandler);
    return mini;
  }

  it.each([
    ['business rule (422)', ApiError.unprocessable('ORDER_CANCELLED', 'This order was cancelled.'), 422],
    ['conflict (409)', ApiError.conflict('REVIEW_ALREADY_EXISTS', 'Already reviewed.'), 409],
    ['authorization (403)', ApiError.forbidden('PERMISSION_DENIED', 'Missing required permission: X'), 403],
    ['not found (404)', ApiError.notFound('REVIEW_NOT_FOUND', 'Review not found.'), 404],
    ['rate limit (429)', ApiError.tooManyRequests('TOO_MANY_LOGIN_ATTEMPTS', 'Too many.'), 429],
    ['reset code (400)', ApiError.badRequest('INVALID_OR_EXPIRED_CODE', 'The code is invalid or has expired.'), 400],
  ])('ApiError %s keeps its status, code and message', async (_label, err, status) => {
    const res = await request(appThrowing(err)).get('/boom');
    expect(res.status).toBe(status);
    expect(res.body).toEqual({ error: { code: err.code, message: err.message } });
  });

  it.each([
    ['ER_DUP_ENTRY', 409, 'DUPLICATE_ENTRY'],
    ['ER_ROW_IS_REFERENCED_2', 409, 'REFERENCED_ROW'],
    ['ER_CHECK_CONSTRAINT_VIOLATED', 400, 'CONSTRAINT_VIOLATED'],
  ])('MySQL %s -> %i %s', async (code, status, apiCode) => {
    const err = Object.assign(new Error('db'), { code });
    const res = await request(appThrowing(err)).get('/boom');
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(apiCode);
  });

  it('an unexpected error is still a logged 500 INTERNAL_SERVER_ERROR', async () => {
    const res = await request(appThrowing(new Error('kaboom'))).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it('only the two body-parser types are mapped: another typed error is still a 500', async () => {
    const err = Object.assign(new Error('unsupported'), { type: 'encoding.unsupported', status: 415 });
    const res = await request(appThrowing(err)).get('/boom');
    expect(res.status).toBe(500);
  });
});
