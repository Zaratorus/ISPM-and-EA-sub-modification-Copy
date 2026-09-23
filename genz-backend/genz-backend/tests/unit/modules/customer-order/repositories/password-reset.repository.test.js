/**
 * password-reset.repository.test.js
 * The SQL behind the password reset: parameterised queries, database-clock
 * (NOW()) expiry and rate checks, the FOR UPDATE row lock, single-use marking,
 * and the two customer-repository additions (row lock + credential update).
 */

jest.mock('../../../../../src/shared/db/connection', () => ({
  pool: { query: jest.fn() },
}));

const { pool } = require('../../../../../src/shared/db/connection');
const passwordResetRepository = require('../../../../../src/modules/customer-order/repositories/password-reset.repository');
const customerRepository = require('../../../../../src/modules/customer-order/repositories/customer.repository');

const conn = { query: jest.fn() };

beforeEach(() => jest.clearAllMocks());

describe('password-reset.repository', () => {
  it('create() stores the hash only, with expiry computed by the database clock', async () => {
    conn.query.mockResolvedValue([{ insertId: 55 }]);
    await expect(passwordResetRepository.create({ customerId: 10, otpHash: 'hash', ttlMinutes: 10 }, conn)).resolves.toBe(55);
    expect(conn.query).toHaveBeenCalledWith(
      'INSERT INTO customer_password_resets (customer_id, otp_hash, expires_at) VALUES (?, ?, NOW() + INTERVAL ? MINUTE)',
      [10, 'hash', 10]
    );
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('findActiveForUpdate() returns only the newest unused, unexpired code with attempts left, locked FOR UPDATE', async () => {
    const row = { password_reset_id: 55, customer_id: 10, otp_hash: 'hash', failed_attempts: 0 };
    conn.query.mockResolvedValue([[row]]);
    await expect(passwordResetRepository.findActiveForUpdate(10, 5, conn)).resolves.toBe(row);
    const [sql, params] = conn.query.mock.calls[0];
    expect(sql).toMatch(/WHERE customer_id = \? AND used_at IS NULL AND expires_at > NOW\(\) AND failed_attempts < \?/);
    expect(sql).toMatch(/ORDER BY created_at DESC, password_reset_id DESC\s+LIMIT 1\s+FOR UPDATE$/);
    expect(params).toEqual([10, 5]);
  });

  it('findActiveForUpdate() returns null when there is no active code', async () => {
    conn.query.mockResolvedValue([[]]);
    await expect(passwordResetRepository.findActiveForUpdate(10, 5, conn)).resolves.toBeNull();
  });

  it('incrementFailedAttempts() updates only that code', async () => {
    conn.query.mockResolvedValue([{ affectedRows: 1 }]);
    await passwordResetRepository.incrementFailedAttempts(55, conn);
    expect(conn.query).toHaveBeenCalledWith(
      'UPDATE customer_password_resets SET failed_attempts = failed_attempts + 1 WHERE password_reset_id = ?',
      [55]
    );
  });

  it("invalidateActive() ends the customer's unused, unexpired codes (rows kept)", async () => {
    conn.query.mockResolvedValue([{ affectedRows: 2 }]);
    await expect(passwordResetRepository.invalidateActive(10, conn)).resolves.toBe(2);
    expect(conn.query).toHaveBeenCalledWith(
      'UPDATE customer_password_resets SET expires_at = NOW() WHERE customer_id = ? AND used_at IS NULL AND expires_at > NOW()',
      [10]
    );
  });

  it('markUsed() sets used_at only on a code that is not used yet, and returns affected rows', async () => {
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([{ affectedRows: 0 }]);
    await expect(passwordResetRepository.markUsed(55, conn)).resolves.toBe(1);
    await expect(passwordResetRepository.markUsed(55, conn)).resolves.toBe(0);
    expect(conn.query).toHaveBeenCalledWith(
      'UPDATE customer_password_resets SET used_at = CURRENT_TIMESTAMP WHERE password_reset_id = ? AND used_at IS NULL',
      [55]
    );
  });

  it('countRecentRequests() counts codes in the cooldown and in the rate window with the database clock', async () => {
    conn.query.mockResolvedValue([[{ in_cooldown: '1', in_window: 3 }]]);
    await expect(passwordResetRepository.countRecentRequests(10, 60, 3600, conn)).resolves.toEqual({ inCooldown: 1, inWindow: 3 });
    const [sql, params] = conn.query.mock.calls[0];
    expect(sql).toMatch(/SUM\(created_at > NOW\(\) - INTERVAL \? SECOND\)/);
    expect(sql).toMatch(/WHERE customer_id = \? AND created_at > NOW\(\) - INTERVAL \? SECOND/);
    expect(params).toEqual([60, 10, 3600]);
  });
});

describe('customer.repository additions', () => {
  it('lockById() locks the customer row FOR UPDATE on the transaction connection', async () => {
    conn.query.mockResolvedValue([[{ customer_id: 10 }]]);
    await expect(customerRepository.lockById(10, conn)).resolves.toBe(true);
    expect(conn.query).toHaveBeenCalledWith('SELECT customer_id FROM customers WHERE customer_id = ? FOR UPDATE', [10]);
  });

  it('updateCredentials() replaces the stored hash for that customer only, on the transaction connection', async () => {
    conn.query.mockResolvedValue([{ affectedRows: 1 }]);
    await expect(customerRepository.updateCredentials(10, 'new-hash', conn)).resolves.toBe(1);
    expect(conn.query).toHaveBeenCalledWith('UPDATE customers SET credentials_reference = ? WHERE customer_id = ?', ['new-hash', 10]);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
