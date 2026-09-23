/**
 * customer.repository.js
 * Direct data access for `customers` only. Module B owns this table
 * exclusively (Physical MySQL Database Schema Design V1.0, Section 3).
 *
 * Note (Logical Database Design V1.1, Section B1 / Physical Schema Design
 * V1.0, Section 3): `contact_info` deliberately carries NO uniqueness
 * constraint — an invented candidate key was explicitly removed at the
 * logical design stage. `findByContactInfo()` therefore returns an ARRAY,
 * not a single row, and does not assume at most one match. Any caller that
 * needs "the one customer with this contact info" (e.g. login) must decide
 * how to handle zero, one, or multiple matches — that decision is not made
 * in this repository.
 */

const { pool } = require('../../../shared/db/connection');

async function findByContactInfo(contactInfo) {
  const [rows] = await pool.query(
    'SELECT customer_id, name, contact_info, credentials_reference, status FROM customers WHERE contact_info = ?',
    [contactInfo]
  );
  return rows;
}

async function findById(customerId) {
  const [rows] = await pool.query(
    'SELECT customer_id, name, contact_info, status, created_at FROM customers WHERE customer_id = ?',
    [customerId]
  );
  return rows[0] || null;
}

async function create({ name, contactInfo, credentialsReference }) {
  const [result] = await pool.query(
    'INSERT INTO customers (name, contact_info, credentials_reference, status) VALUES (?, ?, ?, "ACTIVE")',
    [name, contactInfo, credentialsReference]
  );
  return findById(result.insertId);
}

/**
 * Password reset: locks the customer row inside the caller's transaction so
 * reset-code requests for one account serialize (cooldown/limit checks cannot
 * be raced). Returns false if the customer does not exist.
 */
async function lockById(customerId, conn) {
  const [rows] = await conn.query('SELECT customer_id FROM customers WHERE customer_id = ? FOR UPDATE', [customerId]);
  return rows.length > 0;
}

// Password reset: replaces the stored bcrypt hash inside the caller's transaction.
async function updateCredentials(customerId, credentialsReference, conn) {
  const [result] = await conn.query('UPDATE customers SET credentials_reference = ? WHERE customer_id = ?', [
    credentialsReference,
    customerId,
  ]);
  return result.affectedRows;
}

module.exports = { findByContactInfo, findById, create, lockById, updateCredentials };
