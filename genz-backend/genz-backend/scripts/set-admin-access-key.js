/**
 * scripts/set-admin-access-key.js
 * One-time (or as-needed) setup script to hash and store the Owner/Admin
 * Access Key. Run manually — never called by any route or at server startup.
 *
 * Usage:
 *   ADMIN_ACCESS_KEY_RAW=your-secret-key node scripts/set-admin-access-key.js
 * or set ADMIN_ACCESS_KEY_RAW in .env and just run:
 *   node scripts/set-admin-access-key.js
 *
 * After running, remove/rotate ADMIN_ACCESS_KEY_RAW from .env — it is only
 * needed by this script, never by the running server (server.js/app.js
 * never read it).
 */

require('dotenv').config();
const adminAccessKeyService = require('../src/modules/store-administration/services/admin-access-key.service');
const { pool } = require('../src/shared/db/connection');

async function main() {
  const rawKey = process.env.ADMIN_ACCESS_KEY_RAW;
  if (!rawKey || rawKey === 'changeme_set_once_then_remove_from_env') {
    console.error('Set ADMIN_ACCESS_KEY_RAW to a real secret value before running this script.');
    process.exitCode = 1;
    return;
  }

  await adminAccessKeyService.seedAccessKey(rawKey);
  console.log('Admin Access Key hash stored successfully.');
}

main()
  .catch((err) => {
    console.error('Failed to set Admin Access Key:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
