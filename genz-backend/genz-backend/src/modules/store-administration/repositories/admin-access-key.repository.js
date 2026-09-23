/**
 * admin-access-key.repository.js
 * Direct data access for the single-row `admin_access_key` table only.
 * Physical Schema Design V1.0, Section 12: this table's SELECT access
 * should be restricted at the database-user level to only the service
 * that performs Access-Key validation — this repository is that one
 * intended caller.
 */

const { pool } = require('../../../shared/db/connection');

async function getHash() {
  const [rows] = await pool.query('SELECT access_key_hash FROM admin_access_key WHERE admin_access_key_id = 1');
  return rows[0] ? rows[0].access_key_hash : null;
}

async function setHash(hash) {
  await pool.query(
    `INSERT INTO admin_access_key (admin_access_key_id, access_key_hash)
     VALUES (1, ?)
     ON DUPLICATE KEY UPDATE access_key_hash = VALUES(access_key_hash)`,
    [hash]
  );
}

module.exports = { getHash, setHash };
