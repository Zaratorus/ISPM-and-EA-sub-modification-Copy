/**
 * actor-from-request.js
 * Derives Activity-Log-style actor fields ({ actorType, actorId }) from
 * whichever auth middleware populated the request. Shared because more
 * than one module needs the identical derivation (Module A's manual stock
 * adjustment; Module B's order confirm/status transitions).
 *
 * Only auth-admin-access-key.middleware.js (req.adminSession) and
 * auth-customer-or-admin.middleware.js are currently wired to admin-only
 * routes, so this resolves to OWNER_ADMIN today — but it also recognises
 * req.staffSession (shape: { staffAdminUserId, roleId }, per
 * auth-staff.middleware.js's documented placeholder contract) so nothing
 * needs to change here once Staff authentication (OPEN item 1) is resolved
 * and wired into these routes.
 */

function actorFromRequest(req) {
  if (req.adminSession && req.adminSession.type === 'OWNER_ADMIN') {
    return { actorType: 'OWNER_ADMIN', actorId: null };
  }
  if (req.staffSession && req.staffSession.staffAdminUserId) {
    return { actorType: 'STAFF_ADMIN_USER', actorId: req.staffSession.staffAdminUserId };
  }
  return { actorType: 'SYSTEM', actorId: null };
}

module.exports = actorFromRequest;
