/**
 * auth-staff.middleware.js
 *
 * ============================================================
 * NOT IMPLEMENTED — OPEN DECISION
 * ============================================================
 * Backend/API Architecture Design V1.0, Section 15, item 1:
 * "Exact Staff authentication entry mechanism" remains OPEN.
 *
 * This file exists only as a structural placeholder so that:
 *   1. The module folder layout matches the approved architecture
 *      (Backend/API Architecture Design V1.0, Section 4).
 *   2. rbac.middleware.js has a defined attachment point
 *      (req.staffSession = { staffAdminUserId, roleId }) to build against
 *      once the mechanism is decided.
 *
 * DO NOT implement a username/password, magic-link, or any other specific
 * mechanism here without first getting the OPEN decision resolved by the
 * team/supervisor — inventing one here would silently resolve a business
 * decision this codebase has deliberately left open at every prior stage.
 *
 * Once resolved, this middleware should:
 *   - validate whatever credential/session artifact is chosen
 *   - look up the corresponding row in staff_admin_users
 *   - reject if status = 'DEACTIVATED'
 *   - attach req.staffSession = { staffAdminUserId, roleId }
 *   - call next()
 * ============================================================
 */

const ApiError = require('../utils/ApiError');

function authStaffNotImplemented(req, res, next) {
  return next(
    ApiError.unauthorized(
      'STAFF_AUTH_NOT_IMPLEMENTED',
      'Staff authentication mechanism is an OPEN decision (Backend/API Architecture Design V1.0, Section 15 item 1) and has not been implemented yet.'
    )
  );
}

module.exports = authStaffNotImplemented;
