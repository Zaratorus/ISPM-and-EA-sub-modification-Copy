/**
 * customer.service.test.js
 * bcrypt is mocked deliberately: this sandbox's bcrypt native binding
 * cannot build (see milestone report — unrelated Windows path/tooling
 * issue), so mocking it here both sidesteps that environment limitation
 * and keeps this a true unit test of customer.service.js's own logic.
 */

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));
jest.mock('../../../../../src/modules/customer-order/repositories/customer.repository', () => ({
  findByContactInfo: jest.fn(),
  create: jest.fn(),
}));

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const customerRepository = require('../../../../../src/modules/customer-order/repositories/customer.repository');
const {
  register,
  login,
  issueCustomerSessionToken,
  BCRYPT_ROUNDS,
} = require('../../../../../src/modules/customer-order/services/customer.service');

describe('customer.service.register()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects (409) when contact_info is already registered — application-layer uniqueness (project-owner decision)', async () => {
    customerRepository.findByContactInfo.mockResolvedValue([{ customer_id: 1, status: 'ACTIVE' }]);

    await expect(
      register({ name: 'Jane', contactInfo: 'jane@example.com', password: 'password123' })
    ).rejects.toMatchObject({ statusCode: 409, code: 'CONTACT_INFO_IN_USE' });

    expect(customerRepository.create).not.toHaveBeenCalled();
  });

  it('hashes the password, creates the customer, and returns a session token when contact_info is free', async () => {
    customerRepository.findByContactInfo.mockResolvedValue([]);
    bcrypt.hash.mockResolvedValue('hashed-password');
    customerRepository.create.mockResolvedValue({
      customer_id: 5,
      name: 'Jane',
      contact_info: 'jane@example.com',
    });

    const result = await register({ name: 'Jane', contactInfo: 'jane@example.com', password: 'password123' });

    expect(bcrypt.hash).toHaveBeenCalledWith('password123', BCRYPT_ROUNDS);
    expect(customerRepository.create).toHaveBeenCalledWith({
      name: 'Jane',
      contactInfo: 'jane@example.com',
      credentialsReference: 'hashed-password',
    });
    expect(result).toEqual({
      customerId: 5,
      name: 'Jane',
      contactInfo: 'jane@example.com',
      token: expect.any(String),
    });
  });

  it('never stores the raw password — only the bcrypt output reaches the repository', async () => {
    customerRepository.findByContactInfo.mockResolvedValue([]);
    bcrypt.hash.mockResolvedValue('hashed-password');
    customerRepository.create.mockResolvedValue({ customer_id: 1, name: 'X', contact_info: 'x@example.com' });

    await register({ name: 'X', contactInfo: 'x@example.com', password: 'super-secret' });

    const createArg = customerRepository.create.mock.calls[0][0];
    expect(createArg.credentialsReference).toBe('hashed-password');
    expect(JSON.stringify(createArg)).not.toContain('super-secret');
  });
});

describe('customer.service.login()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs in successfully when exactly one ACTIVE account matches and the password is correct', async () => {
    customerRepository.findByContactInfo.mockResolvedValue([
      { customer_id: 7, name: 'Jane', contact_info: 'jane@example.com', credentials_reference: 'hash', status: 'ACTIVE' },
    ]);
    bcrypt.compare.mockResolvedValue(true);

    const result = await login({ contactInfo: 'jane@example.com', password: 'password123' });

    expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hash');
    expect(result).toEqual({ customerId: 7, name: 'Jane', contactInfo: 'jane@example.com', token: expect.any(String) });
  });

  it('rejects (401 INVALID_CREDENTIALS) when no account matches', async () => {
    customerRepository.findByContactInfo.mockResolvedValue([]);
    await expect(login({ contactInfo: 'nobody@example.com', password: 'x' })).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('rejects (401) with the same generic message when the password is wrong (never reveals which part failed)', async () => {
    customerRepository.findByContactInfo.mockResolvedValue([
      { customer_id: 7, name: 'Jane', contact_info: 'jane@example.com', credentials_reference: 'hash', status: 'ACTIVE' },
    ]);
    bcrypt.compare.mockResolvedValue(false);

    await expect(login({ contactInfo: 'jane@example.com', password: 'wrong' })).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('rejects (401) defensively if more than one ACTIVE row somehow shares the contact_info, rather than guessing which one to log in as', async () => {
    customerRepository.findByContactInfo.mockResolvedValue([
      { customer_id: 1, contact_info: 'dup@example.com', credentials_reference: 'h1', status: 'ACTIVE' },
      { customer_id: 2, contact_info: 'dup@example.com', credentials_reference: 'h2', status: 'ACTIVE' },
    ]);

    await expect(login({ contactInfo: 'dup@example.com', password: 'x' })).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it('ignores a DEACTIVATED account sharing contact_info with no ACTIVE account', async () => {
    customerRepository.findByContactInfo.mockResolvedValue([
      { customer_id: 1, contact_info: 'old@example.com', credentials_reference: 'h1', status: 'DEACTIVATED' },
    ]);

    await expect(login({ contactInfo: 'old@example.com', password: 'x' })).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });
  });
});

describe('customer.service.issueCustomerSessionToken()', () => {
  it('produces a JWT whose payload carries the given customerId', () => {
    const token = issueCustomerSessionToken(42);
    const payload = jwt.decode(token);
    expect(payload.customerId).toBe(42);
  });
});
