/**
 * password-reset.flow.test.js
 * The whole forgot -> email -> verify -> reset flow against a small in-memory
 * model of the database: a controllable clock (standing in for MySQL's
 * NOW()), SELECT ... FOR UPDATE row locks (FIFO), and transactions whose
 * writes only become visible on COMMIT. The "email" is captured instead of
 * sent. Afterwards the real customer.service.login() proves the old password
 * no longer works and the new one does. Deterministic: no sleeps.
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

const { withTransaction } = require('../../../../../src/shared/db/connection');
const customerRepository = require('../../../../../src/modules/customer-order/repositories/customer.repository');
const passwordResetRepository = require('../../../../../src/modules/customer-order/repositories/password-reset.repository');
const { sendPasswordResetOtp } = require('../../../../../src/shared/utils/mailer');
const activityLogService = require('../../../../../src/modules/store-administration/services/activity-log.service');
const passwordResetService = require('../../../../../src/modules/customer-order/services/password-reset.service');
const customerService = require('../../../../../src/modules/customer-order/services/customer.service');

const EMAIL = 'jane@example.com';

function createFakeDatabase() {
  const db = {
    clock: 1_000_000, // seconds; stands in for MySQL NOW()
    customers: new Map([
      [10, { customer_id: 10, name: 'Jane', contact_info: EMAIL, credentials_reference: 'hashed(12):OldPass123!', status: 'ACTIVE' }],
      [11, { customer_id: 11, name: 'Phone Person', contact_info: '+94771234567', credentials_reference: 'hashed(12):Phone123!', status: 'ACTIVE' }],
    ]),
    resets: [],
    emails: [],
    audit: [],
    commits: 0,
    rollbacks: 0,
    nextResetId: 0,
    mailFails: false,
    failCredentialUpdateOnce: false,
  };
  const holders = new Map();
  const queues = new Map();
  const lock = (key, conn) => {
    const holder = holders.get(key);
    if (!holder || holder === conn) {
      holders.set(key, conn);
      conn.locks.add(key);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      if (!queues.has(key)) queues.set(key, []);
      queues.get(key).push(() => {
        holders.set(key, conn);
        conn.locks.add(key);
        resolve();
      });
    });
  };
  const unlockAll = (conn) => {
    for (const key of [...conn.locks]) {
      holders.delete(key);
      const next = (queues.get(key) || []).shift();
      if (next) next();
    }
    conn.locks.clear();
  };

  withTransaction.mockImplementation(async (work) => {
    const conn = { staged: [], locks: new Set() };
    try {
      const result = await work(conn);
      conn.staged.forEach((apply) => apply()); // COMMIT
      db.commits += 1;
      return result;
    } catch (err) {
      db.rollbacks += 1; // ROLLBACK
      throw err;
    } finally {
      unlockAll(conn);
    }
  });

  const activeReset = (customerId, maxAttempts) =>
    db.resets
      .filter((r) => r.customer_id === customerId && r.used_at === null && r.expires_at > db.clock && r.failed_attempts < maxAttempts)
      .sort((a, b) => b.created_at - a.created_at || b.password_reset_id - a.password_reset_id)[0] || null;

  customerRepository.findByContactInfo.mockImplementation(async (contact) =>
    [...db.customers.values()].filter((c) => c.contact_info === contact).map((c) => ({ ...c }))
  );
  customerRepository.lockById.mockImplementation(async (id, conn) => {
    await lock(`customer:${id}`, conn);
    return db.customers.has(id);
  });
  customerRepository.updateCredentials.mockImplementation(async (id, hash, conn) => {
    if (db.failCredentialUpdateOnce) {
      db.failCredentialUpdateOnce = false;
      throw new Error('simulated database failure');
    }
    conn.staged.push(() => {
      db.customers.get(id).credentials_reference = hash;
    });
    return 1;
  });
  passwordResetRepository.countRecentRequests.mockImplementation(async (customerId, cooldown, window) => {
    const mine = db.resets.filter((r) => r.customer_id === customerId);
    return {
      inCooldown: mine.filter((r) => r.created_at > db.clock - cooldown).length,
      inWindow: mine.filter((r) => r.created_at > db.clock - window).length,
    };
  });
  passwordResetRepository.invalidateActive.mockImplementation(async (customerId, conn) => {
    const rows = db.resets.filter((r) => r.customer_id === customerId && r.used_at === null && r.expires_at > db.clock);
    conn.staged.push(() =>
      rows.forEach((r) => {
        r.expires_at = db.clock;
      })
    );
    return rows.length;
  });
  passwordResetRepository.create.mockImplementation(async ({ customerId, otpHash, ttlMinutes }, conn) => {
    db.nextResetId += 1;
    const row = {
      password_reset_id: db.nextResetId,
      customer_id: customerId,
      otp_hash: otpHash,
      expires_at: db.clock + ttlMinutes * 60,
      failed_attempts: 0,
      used_at: null,
      created_at: db.clock,
    };
    conn.staged.push(() => db.resets.push(row));
    return row.password_reset_id;
  });
  passwordResetRepository.findActiveForUpdate.mockImplementation(async (customerId, maxAttempts, conn) => {
    await lock(`resets:${customerId}`, conn);
    const row = activeReset(customerId, maxAttempts);
    return row ? { ...row } : null;
  });
  passwordResetRepository.incrementFailedAttempts.mockImplementation(async (id, conn) => {
    conn.staged.push(() => {
      db.resets.find((r) => r.password_reset_id === id).failed_attempts += 1;
    });
  });
  passwordResetRepository.markUsed.mockImplementation(async (id, conn) => {
    const row = db.resets.find((r) => r.password_reset_id === id);
    if (!row || row.used_at !== null) return 0;
    conn.staged.push(() => {
      row.used_at = db.clock;
    });
    return 1;
  });
  sendPasswordResetOtp.mockImplementation(async (email, otp) => {
    if (db.mailFails) throw new Error('SMTP connection refused');
    db.emails.push({ email, otp });
  });
  activityLogService.logActivity.mockImplementation(async (entry, conn) => {
    conn.staged.push(() => db.audit.push(entry.actionType));
  });
  return db;
}

async function forgot(email = EMAIL) {
  const result = await passwordResetService.requestPasswordReset(email);
  await passwordResetService.settleBackgroundWork();
  return result;
}
const latestCode = (db) => db.emails[db.emails.length - 1].otp;
const outcome = (promise) => promise.then(() => 'SUCCESS', (err) => err.code);
const wrongCodeFor = (code) => (code === '000000' ? '111111' : '000000');
const reset = (code, password = 'NewPass123!') => passwordResetService.resetPassword({ email: EMAIL, otp: code, newPassword: password });

let db;
beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  db = createFakeDatabase();
});

describe('successful reset', () => {
  it('forgot -> email -> verify -> reset: the old password no longer works and the new one does', async () => {
    await expect(forgot()).resolves.toEqual({ message: 'If an account with that email exists, a verification code has been sent.' });
    expect(db.emails).toHaveLength(1);
    const code = latestCode(db);
    expect(code).toMatch(/^[0-9]{6}$/);
    expect(db.resets[0].otp_hash).not.toBe(code);

    await expect(passwordResetService.verifyOtp(EMAIL, code)).resolves.toEqual({ verified: true });
    await expect(reset(code)).resolves.toEqual({ message: 'Password updated. Please log in.' });

    await expect(customerService.login({ contactInfo: EMAIL, password: 'OldPass123!' })).rejects.toMatchObject({ statusCode: 401 });
    await expect(customerService.login({ contactInfo: EMAIL, password: 'NewPass123!' })).resolves.toMatchObject({
      customerId: 10,
      token: expect.any(String),
    });
    expect(db.audit).toEqual(['PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED']);
  });
});

describe('code lifecycle', () => {
  it('single use: the same code cannot reset the password twice', async () => {
    await forgot();
    const code = latestCode(db);
    await reset(code);
    await expect(reset(code, 'Another123!')).rejects.toMatchObject({ code: 'INVALID_OR_EXPIRED_CODE' });
    await expect(passwordResetService.verifyOtp(EMAIL, code)).rejects.toMatchObject({ code: 'INVALID_OR_EXPIRED_CODE' });
    expect(db.customers.get(10).credentials_reference).toBe('hashed(12):NewPass123!');
  });

  it('expires after 10 minutes', async () => {
    await forgot();
    const code = latestCode(db);
    db.clock += 10 * 60 - 1;
    await expect(passwordResetService.verifyOtp(EMAIL, code)).resolves.toEqual({ verified: true });
    db.clock += 1;
    await expect(passwordResetService.verifyOtp(EMAIL, code)).rejects.toMatchObject({ code: 'INVALID_OR_EXPIRED_CODE' });
  });

  it('stops working after 5 wrong attempts, even for the correct code', async () => {
    await forgot();
    const code = latestCode(db);
    for (let i = 0; i < 5; i += 1) {
      await expect(passwordResetService.verifyOtp(EMAIL, wrongCodeFor(code))).rejects.toMatchObject({ code: 'INVALID_OR_EXPIRED_CODE' });
    }
    expect(db.resets[0].failed_attempts).toBe(5);
    await expect(passwordResetService.verifyOtp(EMAIL, code)).rejects.toMatchObject({ code: 'INVALID_OR_EXPIRED_CODE' });
    await expect(reset(code)).rejects.toMatchObject({ code: 'INVALID_OR_EXPIRED_CODE' });
    expect(db.customers.get(10).credentials_reference).toBe('hashed(12):OldPass123!');
  });

  it('wrong attempts on verify and reset share the same limit of 5', async () => {
    await forgot();
    const code = latestCode(db);
    for (let i = 0; i < 3; i += 1) await passwordResetService.verifyOtp(EMAIL, wrongCodeFor(code)).catch(() => {});
    for (let i = 0; i < 2; i += 1) await reset(wrongCodeFor(code)).catch(() => {});
    await expect(reset(code)).rejects.toMatchObject({ code: 'INVALID_OR_EXPIRED_CODE' });
  });

  it('a new code invalidates the previous unused one', async () => {
    await forgot();
    const first = latestCode(db);
    db.clock += 61;
    await forgot();
    const second = latestCode(db);
    expect(db.emails).toHaveLength(2);
    if (first !== second) {
      await expect(passwordResetService.verifyOtp(EMAIL, first)).rejects.toMatchObject({ code: 'INVALID_OR_EXPIRED_CODE' });
    }
    await expect(passwordResetService.verifyOtp(EMAIL, second)).resolves.toEqual({ verified: true });
    expect(db.resets.filter((r) => r.expires_at > db.clock)).toHaveLength(1);
  });
});

describe('request limits', () => {
  it('60-second resend cooldown: a second request inside it sends nothing', async () => {
    await forgot();
    db.clock += 59;
    await expect(forgot()).resolves.toEqual({ message: 'If an account with that email exists, a verification code has been sent.' });
    expect(db.emails).toHaveLength(1);
    expect(db.resets).toHaveLength(1);
    db.clock += 2;
    await forgot();
    expect(db.emails).toHaveLength(2);
  });

  it('at most 5 codes per account per hour', async () => {
    for (let i = 0; i < 5; i += 1) {
      await forgot();
      db.clock += 61;
    }
    expect(db.emails).toHaveLength(5);
    await forgot(); // 6th within the hour of the first
    expect(db.emails).toHaveLength(5);
    db.clock = 1_000_000 + 3600 + 1; // the first request has left the window
    await forgot();
    expect(db.emails).toHaveLength(6);
  });

  it('two simultaneous requests for the same account send only one code', async () => {
    await Promise.all([passwordResetService.requestPasswordReset(EMAIL), passwordResetService.requestPasswordReset(EMAIL)]);
    await passwordResetService.settleBackgroundWork();
    expect(db.emails).toHaveLength(1);
    expect(db.resets).toHaveLength(1);
  });
});

describe('enumeration protection', () => {
  it('unknown and phone-only addresses get the same answer and nothing is stored or sent', async () => {
    const known = await forgot();
    const unknown = await forgot('nobody@example.com');
    const phoneOnlyOwnerGuess = await forgot('phone.person@example.com');
    const phoneNumber = await forgot(null); // the validator turns a phone number into email: null
    expect(unknown).toEqual(known);
    expect(phoneOnlyOwnerGuess).toEqual(known);
    expect(phoneNumber).toEqual(known);
    expect(db.emails).toHaveLength(1);
    expect(db.resets.map((r) => r.customer_id)).toEqual([10]);
  });
});

describe('failure handling', () => {
  it('a failed email leaves no unusable code: nothing is stored, the old code stays valid, and no cooldown is used up', async () => {
    await forgot();
    const oldCode = latestCode(db);
    db.clock += 61;
    db.mailFails = true;
    await expect(forgot()).resolves.toEqual({ message: 'If an account with that email exists, a verification code has been sent.' });
    expect(db.resets).toHaveLength(1);
    await expect(passwordResetService.verifyOtp(EMAIL, oldCode)).resolves.toEqual({ verified: true });
    db.mailFails = false;
    await forgot(); // allowed immediately: the failed attempt did not start a cooldown
    expect(db.emails).toHaveLength(2);
  });

  it('transaction rollback: if the password update fails, the code is not used and can be tried again', async () => {
    await forgot();
    const code = latestCode(db);
    db.failCredentialUpdateOnce = true;
    await expect(reset(code)).rejects.toThrow('simulated database failure');
    expect(db.resets[0].used_at).toBeNull();
    expect(db.customers.get(10).credentials_reference).toBe('hashed(12):OldPass123!');
    await expect(reset(code)).resolves.toEqual({ message: 'Password updated. Please log in.' });
  });
});

describe('concurrency', () => {
  it('two simultaneous resets with the same code: exactly one succeeds', async () => {
    await forgot();
    const code = latestCode(db);
    const results = await Promise.all([outcome(reset(code, 'FirstPass1!')), outcome(reset(code, 'SecondPass2!'))]);
    expect(results.sort()).toEqual(['INVALID_OR_EXPIRED_CODE', 'SUCCESS']);
    expect(db.resets[0].used_at).not.toBeNull();
    expect(db.audit.filter((a) => a === 'PASSWORD_RESET_COMPLETED')).toHaveLength(1);
  });

  it('many simultaneous wrong guesses cannot exceed the 5-attempt limit', async () => {
    await forgot();
    const code = latestCode(db);
    await Promise.all(Array.from({ length: 10 }, () => outcome(passwordResetService.verifyOtp(EMAIL, wrongCodeFor(code)))));
    expect(db.resets[0].failed_attempts).toBe(5);
  });
});
