/**
 * staff.service.test.js
 * Verifies: role-existence validation on create/update, that
 * credentials_reference is NEVER touched anywhere (Staff auth mechanism
 * is OPEN — item 1), and Activity Log writes for every mutation.
 */

jest.mock('../../../../../src/modules/store-administration/repositories/staff.repository', () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  deactivate: jest.fn(),
}));
jest.mock('../../../../../src/modules/store-administration/repositories/role-permission.repository', () => ({
  findRoleById: jest.fn(),
}));
jest.mock('../../../../../src/modules/store-administration/services/activity-log.service', () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

const staffRepository = require('../../../../../src/modules/store-administration/repositories/staff.repository');
const roleRepository = require('../../../../../src/modules/store-administration/repositories/role-permission.repository');
const activityLogService = require('../../../../../src/modules/store-administration/services/activity-log.service');
const staffService = require('../../../../../src/modules/store-administration/services/staff.service');

const admin = { actorType: 'OWNER_ADMIN', actorId: null };

beforeEach(() => jest.clearAllMocks());

describe('staff.service.createStaff()', () => {
  it('400s ROLE_NOT_FOUND when roleId does not exist, without ever calling repository.create', async () => {
    roleRepository.findRoleById.mockResolvedValue(null);
    await expect(staffService.createStaff({ name: 'Jane', roleId: 99 }, admin)).rejects.toMatchObject({
      statusCode: 400,
      code: 'ROLE_NOT_FOUND',
    });
    expect(staffRepository.create).not.toHaveBeenCalled();
  });

  it('creates the staff row (name + roleId only — never a credential) and logs to the Activity Log', async () => {
    roleRepository.findRoleById.mockResolvedValue({ role_id: 2, name: 'Sales' });
    staffRepository.create.mockResolvedValue({
      staff_admin_user_id: 1,
      role_id: 2,
      name: 'Jane',
      status: 'ACTIVE',
      created_at: 'x',
    });

    const result = await staffService.createStaff({ name: 'Jane', roleId: 2 }, admin);

    expect(staffRepository.create).toHaveBeenCalledWith({ name: 'Jane', roleId: 2 });
    const createArg = staffRepository.create.mock.calls[0][0];
    expect(createArg).not.toHaveProperty('credentialsReference');
    expect(createArg).not.toHaveProperty('credentials_reference');
    expect(result).toEqual({ staffAdminUserId: 1, roleId: 2, name: 'Jane', status: 'ACTIVE', createdAt: 'x' });
    expect(activityLogService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'STAFF_CREATED', originatingModule: 'D', affectedEntityId: 1 })
    );
  });
});

describe('staff.service.updateStaff()', () => {
  it('404s when the staff account does not exist', async () => {
    staffRepository.findById.mockResolvedValue(null);
    await expect(staffService.updateStaff(1, { name: 'X' }, admin)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('400s ROLE_NOT_FOUND when changing to a non-existent role', async () => {
    staffRepository.findById.mockResolvedValue({ staff_admin_user_id: 1, role_id: 2, name: 'Jane', status: 'ACTIVE' });
    roleRepository.findRoleById.mockResolvedValue(null);
    await expect(staffService.updateStaff(1, { roleId: 99 }, admin)).rejects.toMatchObject({
      statusCode: 400,
      code: 'ROLE_NOT_FOUND',
    });
    expect(staffRepository.update).not.toHaveBeenCalled();
  });

  it('updates and logs STAFF_UPDATED', async () => {
    staffRepository.findById.mockResolvedValue({ staff_admin_user_id: 1, role_id: 2, name: 'Jane', status: 'ACTIVE' });
    staffRepository.update.mockResolvedValue({
      staff_admin_user_id: 1,
      role_id: 2,
      name: 'Jane Doe',
      status: 'ACTIVE',
      created_at: 'x',
    });

    await staffService.updateStaff(1, { name: 'Jane Doe' }, admin);

    expect(staffRepository.update).toHaveBeenCalledWith(1, { name: 'Jane Doe', roleId: 2 });
    expect(activityLogService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'STAFF_UPDATED', originatingModule: 'D', affectedEntityId: 1 })
    );
  });
});

describe('staff.service.deactivateStaff()', () => {
  it('404s when the staff account does not exist', async () => {
    staffRepository.findById.mockResolvedValue(null);
    await expect(staffService.deactivateStaff(1, admin)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('deactivates and logs STAFF_DEACTIVATED', async () => {
    staffRepository.findById.mockResolvedValue({ staff_admin_user_id: 1, role_id: 2, name: 'Jane', status: 'ACTIVE' });
    staffRepository.deactivate.mockResolvedValue({
      staff_admin_user_id: 1,
      role_id: 2,
      name: 'Jane',
      status: 'DEACTIVATED',
      created_at: 'x',
    });

    const result = await staffService.deactivateStaff(1, admin);

    expect(result.status).toBe('DEACTIVATED');
    expect(activityLogService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'STAFF_DEACTIVATED', originatingModule: 'D' })
    );
  });
});

describe('staff.service.listStaff()', () => {
  it('maps rows to DTOs', async () => {
    staffRepository.findAll.mockResolvedValue([
      { staff_admin_user_id: 1, role_id: 2, name: 'Jane', status: 'ACTIVE', created_at: 'x' },
    ]);
    const result = await staffService.listStaff();
    expect(result).toEqual([{ staffAdminUserId: 1, roleId: 2, name: 'Jane', status: 'ACTIVE', createdAt: 'x' }]);
  });
});
