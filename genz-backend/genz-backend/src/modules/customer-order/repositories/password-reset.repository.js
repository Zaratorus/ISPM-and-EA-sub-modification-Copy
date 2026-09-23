/**
 * password-reset.repository.js
 * Direct data access for `customer_password_resets` (Module B, alongside
 * `customers`). Only the bcrypt hash of a code is stored, never the code.
 * Every time comparison uses MySQL's NOW(), so the database clock alone
 * decides expiry, cooldown and the hourly limit.
 *
 * Row lifecycle: a newer code ends older unused ones by setting
 * expires_at = NOW() (rows are kept as history); used_at is set only when a
 * password is actually changed with that code.
 */

const { pool } = require('../../../shared/db/connection');

const COLUMNS = 'password_reset_id, customer_id, otp_hash, expires_at, failed_attempts, used_at, created_at';

// Codes this customer requested within the cooldown and within the rate window.
async function countRecentRequests(customerId, cooldownSeconds, windowSeconds, conn = pool) {
  const [rows] = await conn.query(
    `SELECT COALESCE(SUM(created_at > NOW() - INTERVAL ? SECOND), 0) AS in_cooldown,
            COUNT(*) AS in_window
       FROM customer_password_resets
      WHERE customer_id = ? AND created_at > NOW() - INTERVAL ? SECOND`,
    [cooldownSeconds, customerId, windowSeconds]
  );
  return { inCooldown: Number(rows[0].in_cooldown), inWindow: Number(rows[0].in_window) };
}

// Ends every unused, unexpired code for the customer (a newer code replaces them).
async function invalidateActive(customerId, conn) {
  const [result] = await conn.query(
    'UPDATE customer_password_resets SET expires_at = NOW() WHERE customer_id = ? AND used_at IS NULL AND expires_at > NOW()',
    [customerId]
  );
  return result.affectedRows;
}

async function create({ customerId, otpHash, ttlMinutes }, conn) {
  const [result] = await conn.query(
    'INSERT INTO customer_password_resets (customer_id, otp_hash, expires_at) VALUES (?, ?, NOW() + INTERVAL ? MINUTE)',
    [customerId, otpHash, ttlMinutes]
  );
  return result.insertId;
}

/**
 * The customer's current code — newest row that is unused, unexpired and still
 * has attempts left — locked FOR UPDATE inside the caller's transaction, so
 * concurrent verify/reset requests for the same code serialize.
 */
async function findActiveForUpdate(customerId, maxFailedAttempts, conn) {
  const [rows] = await conn.query(
    `SELECT ${COLUMNS}
       FROM customer_password_resets
      WHERE customer_id = ? AND used_at IS NULL AND expires_at > NOW() AND failed_attempts < ?
      ORDER BY created_at DESC, password_reset_id DESC
      LIMIT 1
      FOR UPDATE`,
    [customerId, maxFailedAttempts]
  );
  return rows[0] || null;
}

async function incrementFailedAttempts(passwordResetId, conn) {
  await conn.query('UPDATE customer_password_resets SET failed_attempts = failed_attempts + 1 WHERE password_reset_id = ?', [
    passwordResetId,
  ]);
}

// Single use: only marks a code that has not been used yet. Returns affected rows.
async function markUsed(passwordResetId, conn) {
  const [result] = await conn.query(
    'UPDATE customer_password_resets SET used_at = CURRENT_TIMESTAMP WHERE password_reset_id = ? AND used_at IS NULL',
    [passwordResetId]
  );
  return result.affectedRows;
}

module.exports = {
  countRecentRequests,
  invalidateActive,
  create,
  findActiveForUpdate,
  incrementFailedAttempts,
  markUsed,
};
