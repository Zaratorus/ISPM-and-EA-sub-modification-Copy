/**
 * rbac.middleware.js
 * Single shared RBAC check, applied after auth-admin-access-key.middleware.js
 * or auth-staff.middleware.js, consumed uniformly by every Admin-marked route
 * across all four modules (Backend/API Architecture Design V1.0, Section 7).
 *
 * - An Owner/Admin session (Access-Key-derived) always carries full authority
 *   by definition (locked business rule — the Access Key IS the Owner).
 * - A Staff session's authority is checked against roles/permissions/
 *   role_permissions via requiredPermission. Staff auth itself is OPEN
 *   (auth-staff.middleware.js), so this path is implemented and ready,
 *   but cannot yet be exercised until that decision is resolved.
 *
 * Usage: router.post('/staff', authAdminAccessKey, requirePermission('STAFF_MANAGE'), controller)
 * (a Staff-capable route would chain authStaff OR authAdminAccessKey upstream instead)
 */

const ApiError = require('../utils/ApiError');
const { pool } = require('../db/connection');

function requirePermission(permissionName) {
  return async function rbacMiddleware(req, res, next) {
    try {
      // Owner/Admin (Access Key session) always has full authority.
      if (req.adminSession && req.adminSession.type === 'OWNER_ADMIN') {
        return next();
      }

      // Staff session path — implemented and ready, pending auth-staff.middleware.js.
      if (req.staffSession && req.staffSession.roleId) {
        const [rows] = await pool.query(
          `SELECT 1
             FROM role_permissions rp
             JOIN permissions p ON p.permission_id = rp.permission_id
            WHERE rp.role_id = ? AND p.name = ?
            LIMIT 1`,
          [req.staffSession.roleId, permissionName]
        );
        if (rows.length > 0) {
          return next();
        }
        return next(ApiError.forbidden('PERMISSION_DENIED', `Missing required permission: ${permissionName}`));
      }

      return next(ApiError.unauthorized('AUTH_REQUIRED', 'Authentication is required for this action.'));
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { requirePermission };
