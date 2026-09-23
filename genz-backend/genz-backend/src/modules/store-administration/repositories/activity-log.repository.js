/**
 * activity-log.repository.js
 * Direct data access for `activity_log` — the single, central, insert-only
 * audit table (Physical MySQL Database Schema Design V1.0, Section 3/15;
 * Logical Database Design V1.1, Section D5). Owned exclusively by Module D.
 * No other repository in this codebase writes to this table.
 *
 * Insert-only by design: the Activity Log is append-only (Physical Schema
 * Design V1.0, Section 3 — "Business Constraints: Insert-only"). No
 * update/delete function is provided here.
 */

const { pool } = require('../../../shared/db/connection');

/**
 * @param {{
 *   actorType: 'STAFF_ADMIN_USER'|'OWNER_ADMIN'|'SYSTEM'|null,
 *   actorId: number|null,
 *   actionType: string,
 *   affectedEntityType: string,
 *   affectedEntityId: number,
 *   originatingModule: 'A'|'B'|'C'|'D',
 *   contextNote: string|null,
 * }} entry
 * @param {import('mysql2/promise').PoolConnection} [conn] - optional transaction
 *   connection; defaults to the shared pool. Same optional-conn convention
 *   already used by product.repository.js's findByIdIncludingDiscontinued().
 */
async function insert(entry, conn = pool) {
  await conn.query(
    `INSERT INTO activity_log
       (actor_type, actor_id, action_type, affected_entity_type, affected_entity_id, originating_module, context_note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.actorType,
      entry.actorId,
      entry.actionType,
      entry.affectedEntityType,
      entry.affectedEntityId,
      entry.originatingModule,
      entry.contextNote,
    ]
  );
}

/**
 * GET /activity-log — Admin, filterable (Backend/API Architecture Design
 * V1.0, Section 6: "Audit trail, filterable"). Filters supported:
 * originatingModule and actionType — the two dimensions every other
 * module's audit entries are already classified by (see
 * activity-log.service.js.logActivity()'s own validation). No other
 * filter is invented.
 */
async function findAll({ originatingModule, actionType, page, limit }) {
  const where = [];
  const params = [];
  if (originatingModule) {
    where.push('originating_module = ?');
    params.push(originatingModule);
  }
  if (actionType) {
    where.push('action_type = ?');
    params.push(actionType);
  }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const [rows] = await pool.query(
    `SELECT activity_log_id, actor_type, actor_id, action_type, affected_entity_type, affected_entity_id,
            originating_module, context_note, \`timestamp\`
       FROM activity_log
       ${whereClause}
       ORDER BY \`timestamp\` DESC
       LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM activity_log ${whereClause}`, params);
  return { rows, total: countRows[0].total };
}

module.exports = { insert, findAll };
