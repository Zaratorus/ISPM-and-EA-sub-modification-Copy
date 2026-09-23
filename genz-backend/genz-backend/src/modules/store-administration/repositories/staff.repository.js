/**
 * staff.repository.js
 * Direct data access for `staff_admin_users` only. Module D owns this
 * table exclusively (Physical MySQL Database Schema Design V1.0, Section
 * 3). `credentials_reference` is never read or written here — the Staff
 * authentication mechanism is OPEN (Backend/API Architecture Design V1.0,
 * Section 15 item 1); this repository does not touch that column.
 */

const { pool } = require('../../../shared/db/connection');

async function findAll() {
  const [rows] = await pool.query(
    'SELECT staff_admin_user_id, role_id, name, status, created_at, updated_at FROM staff_admin_users ORDER BY name ASC'
  );
  return rows;
}

async function findById(staffAdminUserId) {
  const [rows] = await pool.query(
    'SELECT staff_admin_user_id, role_id, name, status, created_at, updated_at FROM staff_admin_users WHERE staff_admin_user_id = ?',
    [staffAdminUserId]
  );
  return rows[0] || null;
}

async function create({ name, roleId }) {
  const [result] = await pool.query(
    'INSERT INTO staff_admin_users (role_id, name, status) VALUES (?, ?, "ACTIVE")',
    [roleId, name]
  );
  return findById(result.insertId);
}

async function update(staffAdminUserId, { name, roleId }) {
  await pool.query('UPDATE staff_admin_users SET name = ?, role_id = ? WHERE staff_admin_user_id = ?', [
    name,
    roleId,
    staffAdminUserId,
  ]);
  return findById(staffAdminUserId);
}

async function deactivate(staffAdminUserId) {
  await pool.query("UPDATE staff_admin_users SET status = 'DEACTIVATED' WHERE staff_admin_user_id = ?", [
    staffAdminUserId,
  ]);
  return findById(staffAdminUserId);
}

module.exports = { findAll, findById, create, update, deactivate };
