/**
 * customer-auth.routes.test.js
 * Route-contract tests, mounted in a minimal standalone Express app rather
 * than the shared src/app.js — this deliberately avoids pulling in Module
 * D's admin-access-key chain (which requires 'bcrypt', currently unable to
 * load its native binding in this sandbox; see milestone report). The
 * routes under test import bcrypt indirectly via customer.service.js, so
 * bcrypt is mocked here too.
 */

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
}));
jest.mock('../../../../../src/modules/customer-order/repositories/customer.repository', () => ({
  findByContactInfo: jest.fn(),
  create: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const bcrypt = require('bcrypt');
const customerRepository = require('../../../../../src/modules/customer-order/repositories/customer.repository');
const customerAuthRoutes = require('../../../../../src/modules/customer-order/routes/customer-auth.routes');
const errorHandler = require('../../../../../src/shared/middleware/error-handler.middleware');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth/customer', customerAuthRoutes);
  app.use(errorHandler);
  return app;
}

describe('POST /auth/customer/register', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('201s with the created customer and a token when contact_info is free', async () => {
    customerRepository.findByContactInfo.mockResolvedValue([]);
    customerRepository.create.mockResolvedValue({
      customer_id: 1,
      name: 'Jane Doe',
      contact_info: 'jane@example.com',
    });

    const res = await request(buildApp()).post('/api/v1/auth/customer/register').send({
      name: 'Jane Doe',
      contactInfo: 'jane@example.com',
      password: 'Password123!',
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      customerId: 1,
      name: 'Jane Doe',
      contactInfo: 'jane@example.com',
      token: expect.any(String),
    });
  });

  it('409s CONTACT_INFO_IN_USE when contact_info is already registered', async () => {
    customerRepository.findByContactInfo.mockResolvedValue([{ customer_id: 9, status: 'ACTIVE' }]);

    const res = await request(buildApp()).post('/api/v1/auth/customer/register').send({
      name: 'Jane Doe',
      contactInfo: 'jane@example.com',
      password: 'Password123!',
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONTACT_INFO_IN_USE');
    expect(customerRepository.create).not.toHaveBeenCalled();
  });

  it('400s with VALIDATION_ERROR when the password is too short', async () => {
    const res = await request(buildApp()).post('/api/v1/auth/customer/register').send({
      name: 'Jane Doe',
      contactInfo: 'jane@example.com',
      password: 'short',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(customerRepository.findByContactInfo).not.toHaveBeenCalled();
  });

  it('400s when required fields are missing entirely', async () => {
    const res = await request(buildApp()).post('/api/v1/auth/customer/register').send({});
    expect(res.status).toBe(400);
    expect(customerRepository.create).not.toHaveBeenCalled();
  });
});

describe('POST /auth/customer/login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('200s with a token on correct credentials', async () => {
    customerRepository.findByContactInfo.mockResolvedValue([
      { customer_id: 7, name: 'Jane', contact_info: 'jane@example.com', credentials_reference: 'hash', status: 'ACTIVE' },
    ]);
    bcrypt.compare.mockResolvedValue(true);

    const res = await request(buildApp())
      .post('/api/v1/auth/customer/login')
      .send({ contactInfo: 'jane@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      customerId: 7,
      name: 'Jane',
      contactInfo: 'jane@example.com',
      token: expect.any(String),
    });
  });

  it('401s INVALID_CREDENTIALS on a wrong password', async () => {
    customerRepository.findByContactInfo.mockResolvedValue([
      { customer_id: 7, name: 'Jane', contact_info: 'jane@example.com', credentials_reference: 'hash', status: 'ACTIVE' },
    ]);
    bcrypt.compare.mockResolvedValue(false);

    const res = await request(buildApp())
      .post('/api/v1/auth/customer/login')
      .send({ contactInfo: 'jane@example.com', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('401s INVALID_CREDENTIALS when no account matches', async () => {
    customerRepository.findByContactInfo.mockResolvedValue([]);

    const res = await request(buildApp())
      .post('/api/v1/auth/customer/login')
      .send({ contactInfo: 'nobody@example.com', password: 'x' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('POST /auth/customer/register — password and contact validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('400s with a clear message for a weak password and never touches the repository', async () => {
    const res = await request(buildApp())
      .post('/api/v1/auth/customer/register')
      .send({ name: 'Jane Doe', contactInfo: 'jane@example.com', password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'password: Password must contain at least one special character.',
    });
    expect(customerRepository.findByContactInfo).not.toHaveBeenCalled();
  });

  it('400s for an invalid contact such as "abc"', async () => {
    const res = await request(buildApp())
      .post('/api/v1/auth/customer/register')
      .send({ name: 'Jane Doe', contactInfo: 'abc', password: 'Password123!' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('contactInfo: Enter a valid email address or phone number.');
    expect(customerRepository.create).not.toHaveBeenCalled();
  });

  it('checks uniqueness against and stores the normalised contact info', async () => {
    customerRepository.findByContactInfo.mockResolvedValue([]);
    customerRepository.create.mockResolvedValue({ customer_id: 3, name: 'Jane Doe', contact_info: 'jane@example.com' });

    await request(buildApp())
      .post('/api/v1/auth/customer/register')
      .send({ name: 'Jane Doe', contactInfo: '  Jane@Example.COM ', password: 'Password123!' });

    expect(customerRepository.findByContactInfo).toHaveBeenCalledWith('jane@example.com');
    expect(customerRepository.create).toHaveBeenCalledWith(expect.objectContaining({ contactInfo: 'jane@example.com' }));
  });

  it('hashes the password exactly as typed (no trimming)', async () => {
    customerRepository.findByContactInfo.mockResolvedValue([]);
    customerRepository.create.mockResolvedValue({ customer_id: 3, name: 'Jane Doe', contact_info: 'jane@example.com' });

    await request(buildApp())
      .post('/api/v1/auth/customer/register')
      .send({ name: 'Jane Doe', contactInfo: 'jane@example.com', password: '  My Store 2026!  ' });

    expect(bcrypt.hash).toHaveBeenCalledWith('  My Store 2026!  ', expect.any(Number));
  });
});

describe('POST /auth/customer/login — normalised contact, old passwords still accepted', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('looks up an email in lowercase and still accepts an old-style password', async () => {
    customerRepository.findByContactInfo.mockResolvedValue([
      { customer_id: 7, name: 'Jane', contact_info: 'jane@example.com', credentials_reference: 'hash', status: 'ACTIVE' },
    ]);
    bcrypt.compare.mockResolvedValue(true);

    const res = await request(buildApp())
      .post('/api/v1/auth/customer/login')
      .send({ contactInfo: ' JANE@Example.com ', password: 'password123' });

    expect(res.status).toBe(200);
    expect(customerRepository.findByContactInfo).toHaveBeenCalledWith('jane@example.com');
    expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hash');
  });

  it('looks up a phone number without spaces or hyphens', async () => {
    customerRepository.findByContactInfo.mockResolvedValue([]);

    await request(buildApp())
      .post('/api/v1/auth/customer/login')
      .send({ contactInfo: '+94 77-123 4567', password: 'anything' });

    expect(customerRepository.findByContactInfo).toHaveBeenCalledWith('+94771234567');
  });
});
