/**
 * staff.service.js
 * Owning module: D (EP-04). Staff/Admin User account management (create,
 * edit, deactivate — Logical Database Design V1.1, Section D1).
 *
 * Deliberately does NOT set or expose `credentials_reference` anywhere —
 * the Staff authentication mechanism remains OPEN (Backend/API
 * Architecture Design V1.0, Section 15 item 1). A Staff row created here
 * has no way to log in yet; that is a genuinely separate, unresolved
 * decision, not something this service invents a placeholder for.
 */

const ApiError = require('../../../shared/utils/ApiError');
const staffRepository = require('../repositories/staff.repository');
const roleRepository = require('../repositories/role-permission.repository');
const activityLogService = require('./activity-log.service');

function toDTO(row) {
  return {
    staffAdminUserId: row.staff_admin_user_id,
    roleId: row.role_id,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
  };
}

// GET /staff — Admin (list only; no GET /staff/:id is documented).
async function listStaff() {
  const rows = await staffRepository.findAll();
  return rows.map(toDTO);
}

async function requireRoleExists(roleId) {
  const role = await roleRepository.findRoleById(roleId);
  if (!role) {
    throw ApiError.badRequest('ROLE_NOT_FOUND', `Role ${roleId} does not exist.`);
  }
}

// POST /staff — Admin (Owner-level only — see routes/staff.routes.js).
async function createStaff({ name, roleId }, actor) {
  await requireRoleExists(roleId);
  const row = await staffRepository.create({ name, roleId });

  await activityLogService.logActivity({
    actorType: actor.actorType,
    actorId: actor.actorId,
    actionType: 'STAFF_CREATED',
    affectedEntityType: 'StaffAdminUser',
    affectedEntityId: row.staff_admin_user_id,
    originatingModule: 'D',
  });

  return toDTO(row);
}

// PUT /staff/:id — Admin.
async function updateStaff(staffAdminUserId, { name, roleId }, actor) {
  const existing = await staffRepository.findById(staffAdminUserId);
  if (!existing) {
    throw ApiError.notFound('STAFF_NOT_FOUND', `Staff account ${staffAdminUserId} does not exist.`);
  }
  if (roleId) {
    await requireRoleExists(roleId);
  }

  const row = await staffRepository.update(staffAdminUserId, {
    name: name ?? existing.name,
    roleId: roleId ?? existing.role_id,
  });

  await activityLogService.logActivity({
    actorType: actor.actorType,
    actorId: actor.actorId,
    actionType: 'STAFF_UPDATED',
    affectedEntityType: 'StaffAdminUser',
    affectedEntityId: staffAdminUserId,
    originatingModule: 'D',
  });

  return toDTO(row);
}

// PATCH /staff/:id/deactivate — Admin.
async function deactivateStaff(staffAdminUserId, actor) {
  const existing = await staffRepository.findById(staffAdminUserId);
  if (!existing) {
    throw ApiError.notFound('STAFF_NOT_FOUND', `Staff account ${staffAdminUserId} does not exist.`);
  }

  const row = await staffRepository.deactivate(staffAdminUserId);

  await activityLogService.logActivity({
    actorType: actor.actorType,
    actorId: actor.actorId,
    actionType: 'STAFF_DEACTIVATED',
    affectedEntityType: 'StaffAdminUser',
    affectedEntityId: staffAdminUserId,
    originatingModule: 'D',
  });

  return toDTO(row);
}

module.exports = { listStaff, createStaff, updateStaff, deactivateStaff };
