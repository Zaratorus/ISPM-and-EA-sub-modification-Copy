/**
 * role-permission.repository.js
 * Direct data access for `roles`, `permissions`, and the `role_permissions`
 * associative junction. Module D owns all three exclusively (Physical
 * MySQL Database Schema Design V1.0, Section 3). `role_permissions` is a
 * required physical structure, not a 28th conceptual entity (Physical
 * Schema Design V1.0, Section 3/14) — no separate repository file for it.
 */

const { pool } = require('../../../shared/db/connection');

async function findAllRoles() {
  const [rows] = await pool.query('SELECT role_id, name FROM roles ORDER BY name ASC');
  return rows;
}

async function findRoleById(roleId) {
  const [rows] = await pool.query('SELECT role_id, name FROM roles WHERE role_id = ?', [roleId]);
  return rows[0] || null;
}

async function createRole({ name }) {
  const [result] = await pool.query('INSERT INTO roles (name) VALUES (?)', [name]);
  return findRoleById(result.insertId);
}

async function findAllPermissions() {
  const [rows] = await pool.query('SELECT permission_id, name FROM permissions ORDER BY name ASC');
  return rows;
}

async function findPermissionsByIds(permissionIds) {
  if (permissionIds.length === 0) return [];
  const placeholders = permissionIds.map(() => '?').join(', ');
  const [rows] = await pool.query(`SELECT permission_id, name FROM permissions WHERE permission_id IN (${placeholders})`, permissionIds);
  return rows;
}

/**
 * Additive: grants each given permission to the role, leaving any
 * already-granted permissions untouched (`INSERT IGNORE` — the composite
 * PK on role_permissions prevents duplicates). No endpoint for revoking a
 * permission is documented (Backend/API Architecture Design V1.0, Section
 * 6 lists only "Assign permission(s) to role"), so none is implemented.
 */
async function assignPermissionsToRole(roleId, permissionIds) {
  if (permissionIds.length === 0) return;
  const values = permissionIds.map(() => '(?, ?)').join(', ');
  const params = permissionIds.flatMap((permissionId) => [roleId, permissionId]);
  await pool.query(`INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES ${values}`, params);
}

async function findPermissionsByRoleId(roleId) {
  const [rows] = await pool.query(
    `SELECT p.permission_id, p.name
       FROM role_permissions rp
       JOIN permissions p ON p.permission_id = rp.permission_id
      WHERE rp.role_id = ?
      ORDER BY p.name ASC`,
    [roleId]
  );
  return rows;
}

module.exports = {
  findAllRoles,
  findRoleById,
  createRole,
  findAllPermissions,
  findPermissionsByIds,
  assignPermissionsToRole,
  findPermissionsByRoleId,
};
