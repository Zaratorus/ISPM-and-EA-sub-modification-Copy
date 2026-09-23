/**
 * password-reset.service.test.js
 * Branch-by-branch checks of the forgot / verify / reset logic with the data
 * layer mocked. bcrypt is replaced by a transparent fake
 * (hash -> "hashed(<rounds>):<value>") so the stored values and costs can be
 * asserted. The full flow against an in-memory database, including
 * concurrency, is in password-reset.flow.test.js.
 */

jest.mock('bcrypt', () => ({
  hash: jest.fn(async (value, rounds) => `hashed(${rounds}):${value}`),
  compare: jest.fn(async (value, hash) => hash.endsWith(`):${value}`)),
}));
jest.mock('../../../../../src/shared/db/connection', () => ({
  pool: { query: jest.fn() },
  withTransaction: jest.fn(),
}));
jest.mock('../../../../../src/modules/customer-order/repositories/customer.repository', () => ({
  findByContactInfo: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  lockById: jest.fn(),
  updateCredentials: jest.fn(),
}));
jest.mock('../../../../../src/modules/customer-order/repositories/password-reset.repository', () => ({
  countRecentRequests: jest.fn(),
  invalidateActive: jest.fn(),
  create: jest.fn(),
  findActiveForUpdate: jest.fn(),
  incrementFailedAttempts: jest.fn(),
  markUsed: jest.fn(),
}));
jest.mock('../../../../../src/shared/utils/mailer', () => ({
  sendPasswordResetOtp: jest.fn(),
}));
jest.mock('../../../../../src/modules/store-administration/services/activity-log.service', () => ({
  logActivity: jest.fn(),
}));

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { withTransaction } = require('../../../../../src/shared/db/connection');
const customerRepository = require('../../../../../src/modules/customer-order/repositories/customer.repository');
const passwordResetRepository = require('../../../../../src/modules/customer-order/repositories/password-reset.repository');
const { sendPasswordResetOtp } = require('../../../../../src/shared/utils/mailer');
const activityLogService = require('../../../../../src/modules/store-administration/services/activity-log.service');
const service = require('../../../../../src/modules/customer-order/services/password-reset.service');

const fakeConn = { query: jest.fn() };
const tx = { commits: 0, rollbacks: 0 };
const JANE = { customer_id: 10, name: 'Jane', contact_info: 'jane@example.com', credentials_reference: 'hashed(12):OldPass123!', status: 'ACTIVE' };
const ACTIVE_RESET = { password_reset_id: 55, customer_id: 10, otp_hash: 'hashed(10):004821', failed_attempts: 0, used_at: null };
const GENERIC = { message: 'If an account with that email exists, a verification code has been sent.' };

async function forgot(email = 'jane@example.com') {
  const result = await service.requestPasswordReset(email);
  await service.settleBackgroundWork();
  return result;
}

function expectNoCodeIssued() {
  expect(passwordResetRepository.invalidateActive).not.toHaveBeenCalled();
  expect(passwordResetRepository.create).not.toHaveBeenCalled();
  expect(sendPasswordResetOtp).not.toHaveBeenCalled();
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  tx.commits = 0;
  tx.rollbacks = 0;
  withTransaction.mockImplementation(async (work) => {
    try {
      const result = await work(fakeConn);
      tx.commits += 1;
      return result;
    } catch (err) {
      tx.rollbacks += 1;
      throw err;
    }
  });
  customerRepository.findByContactInfo.mockImplementation(async (contact) => (contact === 'jane@example.com' ? [{ ...JANE }] : []));
  customerRepository.lockById.mockResolvedValue(true);
  customerRepository.updateCredentials.mockResolvedValue(1);
  passwordResetRepository.countRecentRequests.mockResolvedValue({ inCooldown: 0, inWindow: 0 });
  passwordResetRepository.invalidateActive.mockResolvedValue(1);
  passwordResetRepository.create.mockResolvedValue(56);
  passwordResetRepository.findActiveForUpdate.mockResolvedValue({ ...ACTIVE_RESET });
  passwordResetRepository.markUsed.mockResolvedValue(1);
  sendPasswordResetOtp.mockResolvedValue(undefined);
  activityLogService.logActivity.mockResolvedValue(undefined);
});

describe('requestPasswordReset() — forgot', () => {
  it('existing email: generic answer; a code is issued in one transaction on the locked customer row and emailed', async () => {
    jest.spyOn(crypto, 'randomInt').mockReturnValue(4821);
    const mathRandom = jest.spyOn(Math, 'random');

    await expect(forgot()).resolves.toEqual(GENERIC);

    expect(crypto.randomInt).toHaveBeenCalledWith(0, 1000000);
    expect(mathRandom).not.toHaveBeenCalled();
    expect(customerRepository.lockById).toHaveBeenCalledWith(10, fakeConn);
    expect(passwordResetRepository.countRecentRequests).toHaveBeenCalledWith(10, 60, 3600, fakeConn);
    expect(bcrypt.hash).toHaveBeenCalledWith('004821', 10); // 6 digits with leading zeros, bcrypt cost 10
    expect(passwordResetRepository.invalidateActive).toHaveBeenCalledWith(10, fakeConn);
    expect(passwordResetRepository.create).toHaveBeenCalledWith({ customerId: 10, otpHash: 'hashed(10):004821', ttlMinutes: 10 }, fakeConn);
    expect(passwordResetRepository.invalidateActive.mock.invocationCallOrder[0]).toBeLessThan(
      passwordResetRepository.create.mock.invocationCallOrder[0]
    );
    expect(sendPasswordResetOtp).toHaveBeenCalledWith('jane@example.com', '004821', 10);
    expect(sendPasswordResetOtp.mock.invocationCallOrder[0]).toBeGreaterThan(passwordResetRepository.create.mock.invocationCallOrder[0]);
    expect(activityLogService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'PASSWORD_RESET_REQUESTED',
        affectedEntityType: 'Customer',
        affectedEntityId: 10,
        originatingModule: 'B',
        contextNote: 'Customer #10 requested a password reset code.',
      }),
      fakeConn
    );
    expect(tx).toEqual({ commits: 1, rollbacks: 0 });
  });

  it('never stores or returns the plain code', async () => {
    jest.spyOn(crypto, 'randomInt').mockReturnValue(918203);
    const result = await forgot();
    expect(JSON.stringify(result)).not.toContain('918203');
    expect(JSON.stringify(passwordResetRepository.create.mock.calls)).not.toMatch(/"918203"|otp":"918203/);
    expect(passwordResetRepository.create.mock.calls[0][0].otpHash).not.toBe('918203');
    expect(JSON.stringify(activityLogService.logActivity.mock.calls)).not.toContain('918203');
  });

  it.each([
    ['an unknown email', 'nobody@example.com', []],
    ['a phone-only customer (no email on the account)', 'phone.person@example.com', []],
    ['a deactivated account', 'jane@example.com', [{ ...JANE, status: 'DEACTIVATED' }]],
    ['two active accounts sharing the address (legacy data)', 'jane@example.com', [{ ...JANE }, { ...JANE, customer_id: 11 }]],
  ])('%s: the same generic answer and no code', async (_label, email, rows) => {
    customerRepository.findByContactInfo.mockResolvedValue(rows);
    await expect(forgot(email)).resolves.toEqual(GENERIC);
    expect(withTransaction).not.toHaveBeenCalled();
    expectNoCodeIssued();
  });

  it('a phone number (validated to email: null): the same generic answer, no lookup and no code', async () => {
    await expect(forgot(null)).resolves.toEqual(GENERIC);
    expect(customerRepository.findByContactInfo).not.toHaveBeenCalled();
    expect(withTransaction).not.toHaveBeenCalled();
    expectNoCodeIssued();
  });

  it('cooldown: a request within 60 seconds gets the generic answer and no new code or email', async () => {
    passwordResetRepository.countRecentRequests.mockResolvedValue({ inCooldown: 1, inWindow: 1 });
    await expect(forgot()).resolves.toEqual(GENERIC);
    expectNoCodeIssued();
  });

  it('hourly limit: the 6th request within an hour gets the generic answer and no new code or email', async () => {
    passwordResetRepository.countRecentRequests.mockResolvedValue({ inCooldown: 0, inWindow: 5 });
    await expect(forgot()).resolves.toEqual(GENERIC);
    expectNoCodeIssued();
  });

  it('the 5th request within an hour is still allowed', async () => {
    passwordResetRepository.countRecentRequests.mockResolvedValue({ inCooldown: 0, inWindow: 4 });
    await forgot();
    expect(sendPasswordResetOtp).toHaveBeenCalledTimes(1);
  });

  it('email failure: everything rolls back, the error is logged safely, and the answer is still generic', async () => {
    jest.spyOn(crypto, 'randomInt').mockReturnValue(123456);
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
    sendPasswordResetOtp.mockRejectedValue(new Error('SMTP connection refused'));

    await expect(forgot()).resolves.toEqual(GENERIC);

    expect(tx).toEqual({ commits: 0, rollbacks: 1 }); // the new code and the invalidation are undone
    expect(logged).toHaveBeenCalledTimes(1);
    const line = String(logged.mock.calls[0][0]);
    expect(line).toBe('[password-reset] Could not issue a reset code for customer #10: SMTP connection refused');
    expect(line).not.toContain('123456');
    expect(line).not.toContain('test-smtp-pass');
  });

  it('answers identically whether or not the account exists', async () => {
    const existing = await forgot('jane@example.com');
    const unknown = await forgot('nobody@example.com');
    expect(existing).toEqual(unknown);
  });
});

describe('verifyOtp()', () => {
  it('correct code: { verified: true } without using the code up', async () => {
    await expect(service.verifyOtp('jane@example.com', '004821')).resolves.toEqual({ verified: true });
    expect(passwordResetRepository.findActiveForUpdate).toHaveBeenCalledWith(10, 5, fakeConn);
    expect(passwordResetRepository.incrementFailedAttempts).not.toHaveBeenCalled();
    expect(passwordResetRepository.markUsed).not.toHaveBeenCalled();
    expect(customerRepository.updateCredentials).not.toHaveBeenCalled();
  });

  it('wrong code: 400 INVALID_OR_EXPIRED_CODE and the failed attempt is counted and committed', async () => {
    await expect(service.verifyOtp('jane@example.com', '999999')).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_OR_EXPIRED_CODE',
    });
    expect(passwordResetRepository.incrementFailedAttempts).toHaveBeenCalledWith(55, fakeConn);
    expect(tx).toEqual({ commits: 1, rollbacks: 0 });
  });

  it.each(['an expired code', 'an already-used code', 'a code with 5 failed attempts'])(
    '%s (no active code) gets the same 400 and a dummy comparison',
    async () => {
      passwordResetRepository.findActiveForUpdate.mockResolvedValue(null);
      await expect(service.verifyOtp('jane@example.com', '004821')).rejects.toMatchObject({ code: 'INVALID_OR_EXPIRED_CODE' });
      expect(bcrypt.compare).toHaveBeenCalled();
      expect(passwordResetRepository.incrementFailedAttempts).not.toHaveBeenCalled();
    }
  );

  it('unknown email: the same 400, after a dummy comparison, with no transaction', async () => {
    const unknown = await service.verifyOtp('nobody@example.com', '004821').catch((e) => e);
    const wrong = await service.verifyOtp('jane@example.com', '999999').catch((e) => e);
    expect({ status: unknown.statusCode, code: unknown.code, message: unknown.message }).toEqual({
      status: wrong.statusCode,
      code: wrong.code,
      message: wrong.message,
    });
    expect(bcrypt.compare).toHaveBeenCalledWith('004821', expect.any(String));
  });
});

describe('resetPassword()', () => {
  const body = { email: 'jane@example.com', otp: '004821', newPassword: 'NewPass123!' };

  it('success: hashes with cost 12, updates the credentials and marks the code used in one transaction; no token', async () => {
    const result = await service.resetPassword(body);

    expect(result).toEqual({ message: 'Password updated. Please log in.' });
    expect(result).not.toHaveProperty('token');
    expect(bcrypt.hash).toHaveBeenCalledWith('NewPass123!', 12);
    expect(customerRepository.updateCredentials).toHaveBeenCalledWith(10, 'hashed(12):NewPass123!', fakeConn);
    expect(passwordResetRepository.markUsed).toHaveBeenCalledWith(55, fakeConn);
    expect(customerRepository.updateCredentials.mock.invocationCallOrder[0]).toBeLessThan(
      passwordResetRepository.markUsed.mock.invocationCallOrder[0]
    );
    expect(activityLogService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'PASSWORD_RESET_COMPLETED',
        affectedEntityId: 10,
        contextNote: 'Customer #10 completed a password reset.',
      }),
      fakeConn
    );
    expect(JSON.stringify(activityLogService.logActivity.mock.calls)).not.toMatch(/NewPass123!|004821|hashed\(/);
    expect(tx).toEqual({ commits: 1, rollbacks: 0 });
  });

  it('wrong code: 400, the failed attempt is committed, and the password is not touched', async () => {
    await expect(service.resetPassword({ ...body, otp: '111111' })).rejects.toMatchObject({ code: 'INVALID_OR_EXPIRED_CODE' });
    expect(passwordResetRepository.incrementFailedAttempts).toHaveBeenCalledWith(55, fakeConn);
    expect(customerRepository.updateCredentials).not.toHaveBeenCalled();
    expect(tx).toEqual({ commits: 1, rollbacks: 0 });
  });

  it('no active code (expired / used / too many attempts): 400 and nothing changes', async () => {
    passwordResetRepository.findActiveForUpdate.mockResolvedValue(null);
    await expect(service.resetPassword(body)).rejects.toMatchObject({ code: 'INVALID_OR_EXPIRED_CODE' });
    expect(customerRepository.updateCredentials).not.toHaveBeenCalled();
    expect(passwordResetRepository.markUsed).not.toHaveBeenCalled();
  });

  it('unknown email: the same 400 and no transaction', async () => {
    await expect(service.resetPassword({ ...body, email: 'nobody@example.com' })).rejects.toMatchObject({ code: 'INVALID_OR_EXPIRED_CODE' });
    expect(withTransaction).not.toHaveBeenCalled();
  });

  it('rolls back when the credential update fails: the code is not marked used', async () => {
    customerRepository.updateCredentials.mockRejectedValue(new Error('simulated database failure'));
    await expect(service.resetPassword(body)).rejects.toThrow('simulated database failure');
    expect(passwordResetRepository.markUsed).not.toHaveBeenCalled();
    expect(activityLogService.logActivity).not.toHaveBeenCalled();
    expect(tx).toEqual({ commits: 0, rollbacks: 1 });
  });

  it('rolls back the password change when the code turns out to be used already (markUsed affects 0 rows)', async () => {
    passwordResetRepository.markUsed.mockResolvedValue(0);
    await expect(service.resetPassword(body)).rejects.toMatchObject({ code: 'INVALID_OR_EXPIRED_CODE' });
    expect(activityLogService.logActivity).not.toHaveBeenCalled();
    expect(tx).toEqual({ commits: 0, rollbacks: 1 });
  });
});
