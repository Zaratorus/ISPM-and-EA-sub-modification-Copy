/**
 * connection.js
 * Single shared MySQL connection pool for the whole application.
 * Every repository imports this pool — no module creates its own connection.
 *
 * Per Physical MySQL Database Schema Design V1.0 (Section 5), several business
 * rules can only be enforced correctly inside a database transaction
 * (e.g. order confirmation + stock decrease must be atomic). getConnection()
 * is exported specifically so services that need a transaction
 * (see Backend/API Architecture Design V1.0, Section 12) can acquire a
 * dedicated connection, BEGIN/COMMIT/ROLLBACK explicitly, and release it.
 */

const fs = require('fs');
const mysql = require('mysql2/promise');
const config = require('../../config/env.config');

// Aiven (and most managed MySQL providers) refuse any connection that
// doesn't negotiate TLS — unlike local MySQL, which has no TLS listener at
// all. Three cases:
//   - DB_SSL_CA_PATH set: verified TLS against that CA — the safest option,
//     use it whenever the provider's CA cert is available on disk (e.g. a
//     Render secret file).
//   - unset, in production: the provider still requires TLS, but with no CA
//     on disk there's nothing to verify the server cert against. Connect
//     with rejectUnauthorized: false (encrypted, not verified) rather than
//     fail the handshake outright — this is what actually lets Render reach
//     Aiven when DB_SSL_CA_PATH hasn't been wired up yet.
//   - unset, outside production: connect in plain TCP, matching local
//     MySQL's existing default so nothing changes for local dev.
function sslConfig() {
  if (config.db.sslCaPath) {
    return { ca: fs.readFileSync(config.db.sslCaPath), rejectUnauthorized: true };
  }
  if (config.env === 'production') {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

const ssl = sslConfig();

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: config.db.connectionLimit,
  queueLimit: 0,
  decimalNumbers: false, // keep DECIMAL columns as strings to avoid float precision loss
  ...(ssl ? { ssl } : {}),
});

/**
 * Run a function inside a transaction. The function receives a dedicated
 * connection and must use it for every query. Commits on success,
 * rolls back on any thrown error, always releases the connection.
 *
 * @param {(conn: import('mysql2/promise').PoolConnection) => Promise<any>} work
 */
async function withTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, withTransaction };
