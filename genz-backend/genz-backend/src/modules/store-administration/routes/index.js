/**
 * Module D (EP-04 — Store Administration Management) route index.
 *
 * IMPLEMENTED: Owner/Admin Access Key flow, Staff/Admin User management
 * (create is Owner-level only — see staff.routes.js), Roles, Permissions,
 * Store Settings, the Activity Log (write, from every module, since the
 * EP-02 milestone; read/listing added here), and the read-only Dashboard.
 *
 * NOT IMPLEMENTED: no Staff login endpoint exists anywhere in this module
 * — the Staff authentication mechanism remains OPEN (Backend/API
 * Architecture Design V1.0, Section 15, item 1). Every "Admin"-marked
 * route below is reachable only via the Owner/Admin Access Key today;
 * `auth-staff.middleware.js` remains an unimplemented placeholder, and no
 * route in this module wires it in.
 */

const adminAccessKeyRoutes = require('./admin-access-key.routes');
const staffRoutes = require('./staff.routes');
const roleRoutes = require('./role.routes');
const permissionRoutes = require('./permission.routes');
const settingsRoutes = require('./store-settings.routes');
const dashboardRoutes = require('./dashboard.routes');
const activityLogRoutes = require('./activity-log.routes');

module.exports = {
  adminAccessKeyRoutes,
  staffRoutes,
  roleRoutes,
  permissionRoutes,
  settingsRoutes,
  dashboardRoutes,
  activityLogRoutes,
};
