/**
 * activity-log.service.js
 *
 * ============================================================
 * THE SINGLE, CENTRAL AUDIT WRITER — Module D (EP-04).
 * ============================================================
 * Implements the one central Activity Log described throughout the
 * approved architecture chain:
 *   - Detailed System Architecture V1.2, Section 19 ("Single audit
 *     ownership: Module D owns the one central Activity/Audit Log...
 *     Other modules... report into Module D's central log, not [a]
 *     second, parallel audit system.")
 *   - Database Architecture V1.1, Section 21 / Logical Design V1.1,
 *     Section D5 (the `activity_log` entity/table itself).
 *   - Backend/API Architecture Design V1.0, Section 4 (this file's
 *     placement) and Section 14 (cross-module communication diagram:
 *     every module writes an audit entry into this one service).
 *
 * Every module (A, B, C, and D itself) calls `logActivity()` — this is
 * the audit-equivalent of Module A's inventory.service.js: a single
 * exposed, in-process interface other modules call directly. No module
 * (including this one) writes to the `activity_log` table except through
 * activity-log.repository.js, which only this service imports.
 *
 * `listActivityLog()` (added for EP-04) implements the read side, GET
 * /activity-log (Backend/API Architecture Design V1.0, Section 6:
 * "Audit trail, filterable"). No new field beyond the documented
 * `activity_log` columns is introduced.
 */

const activityLogRepository = require('../repositories/activity-log.repository');

// The four final-scope modules (EP-01..EP-04). The activity_log table's
// originating_module ENUM still contains 'E' purely for historical
// compatibility with rows written before the descoped Supplier &
// Procurement module was removed — the application never writes it.
const VALID_MODULES = Object.freeze(['A', 'B', 'C', 'D']);
const VALID_ACTOR_TYPES = Object.freeze(['STAFF_ADMIN_USER', 'OWNER_ADMIN', 'SYSTEM']);

/**
 * Records one Activity Log entry. Insert-only — no update/delete is
 * exposed, consistent with the append-only business rule.
 *
 * @param {{
 *   actorType?: 'STAFF_ADMIN_USER'|'OWNER_ADMIN'|'SYSTEM',
 *   actorId?: number,
 *   actionType: string,
 *   affectedEntityType: string,
 *   affectedEntityId: number,
 *   originatingModule: 'A'|'B'|'C'|'D',
 *   contextNote?: string,
 * }} entry
 * @param {import('mysql2/promise').PoolConnection} [conn] - optional transaction
 *   connection, so a caller already inside a transaction (e.g. a future
 *   order-confirmation transaction in Module B) can have its audit entry
 *   commit/roll back atomically with the rest of that transaction — same
 *   pattern already used by inventory.service.js's decreaseStock/increaseStock.
 *   Not required: callers outside a transaction may omit it.
 */
async function logActivity(entry, conn) {
  if (!entry || typeof entry !== 'object') {
    throw new Error('logActivity() requires an entry object.');
  }
  const { actorType, actorId, actionType, affectedEntityType, affectedEntityId, originatingModule, contextNote } = entry;

  if (!actionType || !affectedEntityType || affectedEntityId == null || !originatingModule) {
    throw new Error(
      'logActivity() requires actionType, affectedEntityType, affectedEntityId, and originatingModule.'
    );
  }
  if (!VALID_MODULES.includes(originatingModule)) {
    throw new Error(`logActivity(): invalid originatingModule "${originatingModule}".`);
  }
  if (actorType != null && !VALID_ACTOR_TYPES.includes(actorType)) {
    throw new Error(`logActivity(): invalid actorType "${actorType}".`);
  }

  await activityLogRepository.insert(
    {
      actorType: actorType ?? null,
      actorId: actorId ?? null,
      actionType,
      affectedEntityType,
      affectedEntityId,
      originatingModule,
      contextNote: contextNote ?? null,
    },
    conn
  );
}

function toDTO(row) {
  return {
    activityLogId: row.activity_log_id,
    actorType: row.actor_type,
    actorId: row.actor_id,
    actionType: row.action_type,
    affectedEntityType: row.affected_entity_type,
    affectedEntityId: row.affected_entity_id,
    originatingModule: row.originating_module,
    contextNote: row.context_note,
    timestamp: row.timestamp,
  };
}

// GET /activity-log — Admin, filterable by originatingModule and/or actionType.
async function listActivityLog({ originatingModule, actionType, page, limit }) {
  const { rows, total } = await activityLogRepository.findAll({ originatingModule, actionType, page, limit });
  return { data: rows.map(toDTO), meta: { page, limit, total } };
}

module.exports = { logActivity, listActivityLog };
