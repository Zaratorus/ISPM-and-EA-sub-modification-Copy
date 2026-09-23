/**
 * role-permission.service.test.js
 * Verifies Role/Permission listing+creation and the additive
 * assign-permissions-to-role flow, including existence validation for
 * both the role and every permission id given.
 */

jest.mock('../../../../../src/modules/store-administration/repositories/role-permission.repository', () => ({
  findAllRoles: jest.fn(),
  findRoleById: jest.fn(),
  createRole: jest.fn(),
  findAllPermissions: jest.fn(),
  findPermissionsByIds: jest.fn(),
  assignPermissionsToRole: jest.fn(),
  findPermissionsByRoleId: jest.fn(),
}));
jest.mock('../../../../../src/modules/store-administration/services/activity-log.service', () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

const roleRepository = require('../../../../../src/modules/store-administration/repositories/role-permission.repository');
const activityLogService = require('../../../../../src/modules/store-administration/services/activity-log.service');
const roleService = require('../../../../../src/modules/store-administration/services/role-permission.service');

const admin = { actorType: 'OWNER_ADMIN', actorId: null };

beforeEach(() => jest.clearAllMocks());

describe('role-permission.service.createRole()', () => {
  it('creates a role and logs ROLE_CREATED', async () => {
    roleRepository.createRole.mockResolvedValue({ role_id: 1, name: 'Sales' });
    const result = await roleService.createRole({ name: 'Sales' }, admin);
    expect(result).toEqual({ roleId: 1, name: 'Sales' });
    expect(activityLogService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'ROLE_CREATED', originatingModule: 'D', affectedEntityId: 1 })
    );
  });
});

describe('role-permission.service.listRoles() / listPermissions()', () => {
  it('maps roles to DTOs', async () => {
    roleRepository.findAllRoles.mockResolvedValue([{ role_id: 1, name: 'Sales' }]);
    expect(await roleService.listRoles()).toEqual([{ roleId: 1, name: 'Sales' }]);
  });

  it('maps permissions to DTOs', async () => {
    roleRepository.findAllPermissions.mockResolvedValue([{ permission_id: 1, name: 'PRODUCT_MANAGE' }]);
    expect(await roleService.listPermissions()).toEqual([{ permissionId: 1, name: 'PRODUCT_MANAGE' }]);
  });
});

describe('role-permission.service.assignPermissionsToRole()', () => {
  it('404s ROLE_NOT_FOUND when the role does not exist', async () => {
    roleRepository.findRoleById.mockResolvedValue(null);
    await expect(roleService.assignPermissionsToRole(99, [1], admin)).rejects.toMatchObject({
      statusCode: 404,
      code: 'ROLE_NOT_FOUND',
    });
    expect(roleRepository.assignPermissionsToRole).not.toHaveBeenCalled();
  });

  it('400s PERMISSION_NOT_FOUND when any given permissionId does not exist', async () => {
    roleRepository.findRoleById.mockResolvedValue({ role_id: 1, name: 'Sales' });
    roleRepository.findPermissionsByIds.mockResolvedValue([{ permission_id: 1, name: 'PRODUCT_MANAGE' }]); // only 1 of 2 found
    await expect(roleService.assignPermissionsToRole(1, [1, 999], admin)).rejects.toMatchObject({
      statusCode: 400,
      code: 'PERMISSION_NOT_FOUND',
    });
    expect(roleRepository.assignPermissionsToRole).not.toHaveBeenCalled();
  });

  it('assigns the permissions, logs ROLE_PERMISSIONS_ASSIGNED, and returns the resulting permission set', async () => {
    roleRepository.findRoleById.mockResolvedValue({ role_id: 1, name: 'Sales' });
    roleRepository.findPermissionsByIds.mockResolvedValue([
      { permission_id: 1, name: 'ORDER_MANAGE' },
      { permission_id: 2, name: 'PRODUCT_MANAGE' },
    ]);
    roleRepository.findPermissionsByRoleId.mockResolvedValue([
      { permission_id: 1, name: 'ORDER_MANAGE' },
      { permission_id: 2, name: 'PRODUCT_MANAGE' },
    ]);

    const result = await roleService.assignPermissionsToRole(1, [1, 2], admin);

    expect(roleRepository.assignPermissionsToRole).toHaveBeenCalledWith(1, [1, 2]);
    expect(result).toEqual({
      roleId: 1,
      name: 'Sales',
      permissions: [
        { permissionId: 1, name: 'ORDER_MANAGE' },
        { permissionId: 2, name: 'PRODUCT_MANAGE' },
      ],
    });
    expect(activityLogService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'ROLE_PERMISSIONS_ASSIGNED', originatingModule: 'D', affectedEntityId: 1 })
    );
  });
});
