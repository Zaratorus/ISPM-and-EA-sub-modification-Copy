/**
 * role-permission.service.js
 * Owning module: D (EP-04). Role and Permission management, and assigning
 * Permissions to a Role (writes the `role_permissions` associative
 * junction — Logical Database Design V1.1, Section D2/D3).
 */

const ApiError = require('../../../shared/utils/ApiError');
const roleRepository = require('../repositories/role-permission.repository');
const activityLogService = require('./activity-log.service');

function toRoleDTO(row) {
  return { roleId: row.role_id, name: row.name };
}
function toPermissionDTO(row) {
  return { permissionId: row.permission_id, name: row.name };
}

async function listRoles() {
  const rows = await roleRepository.findAllRoles();
  return rows.map(toRoleDTO);
}

async function createRole({ name }, actor) {
  const role = await roleRepository.createRole({ name });

  await activityLogService.logActivity({
    actorType: actor.actorType,
    actorId: actor.actorId,
    actionType: 'ROLE_CREATED',
    affectedEntityType: 'Role',
    affectedEntityId: role.role_id,
    originatingModule: 'D',
  });

  return toRoleDTO(role);
}

async function listPermissions() {
  const rows = await roleRepository.findAllPermissions();
  return rows.map(toPermissionDTO);
}

/**
 * POST /roles/:id/permissions — additive grant (see
 * role-permission.repository.js.assignPermissionsToRole for why).
 */
async function assignPermissionsToRole(roleId, permissionIds, actor) {
  const role = await roleRepository.findRoleById(roleId);
  if (!role) {
    throw ApiError.notFound('ROLE_NOT_FOUND', `Role ${roleId} does not exist.`);
  }

  const foundPermissions = await roleRepository.findPermissionsByIds(permissionIds);
  if (foundPermissions.length !== permissionIds.length) {
    throw ApiError.badRequest('PERMISSION_NOT_FOUND', 'One or more permissionIds do not exist.');
  }

  await roleRepository.assignPermissionsToRole(roleId, permissionIds);

  await activityLogService.logActivity({
    actorType: actor.actorType,
    actorId: actor.actorId,
    actionType: 'ROLE_PERMISSIONS_ASSIGNED',
    affectedEntityType: 'Role',
    affectedEntityId: roleId,
    originatingModule: 'D',
    contextNote: `Assigned permission IDs: ${permissionIds.join(', ')}`,
  });

  const permissions = await roleRepository.findPermissionsByRoleId(roleId);
  return { roleId, name: role.name, permissions: permissions.map(toPermissionDTO) };
}

module.exports = { listRoles, createRole, listPermissions, assignPermissionsToRole };
