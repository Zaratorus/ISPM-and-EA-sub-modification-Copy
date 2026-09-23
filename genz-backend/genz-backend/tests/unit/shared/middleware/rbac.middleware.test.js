/**
 * rbac.middleware.test.js
 * Verifies the shared RBAC gate used by every Admin-marked route across
 * all four modules (Backend/API Architecture Design V1.0, Section 7),
 * including PATCH /reviews/:id/moderate — Module C's moderation endpoint.
 *
 * Owner/Admin always passes (Access Key session = full authority by
 * definition). A Staff session's authority is checked against
 * role_permissions/permissions in the DB. Staff HTTP authentication
 * itself is OPEN and unimplemented (auth-staff.middleware.js), so these
 * cases are exercised directly against the middleware function with a
 * manually-constructed req.staffSession — exactly the shape
 * auth-staff.middleware.js is documented to attach once that OPEN
 * decision is resolved (rbac.middleware.js's own header comment: "this
 * path is implemented and ready ... cannot yet be exercised until that
 * decision is resolved"). This does NOT invent or wire any Staff
 * authentication mechanism — it only tests the already-implemented,
 * already-approved permission-check logic in isolation.
 */

jest.mock('../../../../src/shared/db/connection', () => ({
  pool: { query: jest.fn() },
}));

const { pool } = require('../../../../src/shared/db/connection');
const { requirePermission } = require('../../../../src/shared/middleware/rbac.middleware');

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

beforeEach(() => jest.clearAllMocks());

describe('requirePermission() — unauthorized access', () => {
  it('401s when neither an Owner/Admin session nor a Staff session is present', async () => {
    const req = {};
    const next = jest.fn();
    await requirePermission('REVIEW_MODERATE')(req, {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, code: 'AUTH_REQUIRED' }));
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('requirePermission() — Owner/Admin always authorized', () => {
  it('calls next() with no error and never queries the DB', async () => {
    const req = { adminSession: { type: 'OWNER_ADMIN' } };
    const next = jest.fn();
    await requirePermission('REVIEW_MODERATE')(req, {}, next);
    expect(next).toHaveBeenCalledWith();
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('requirePermission() — Staff, permission granted', () => {
  it('calls next() with no error when role_permissions has a matching row', async () => {
    pool.query.mockResolvedValue([[{ 1: 1 }]]);
    const req = { staffSession: { staffAdminUserId: 7, roleId: 2 } };
    const next = jest.fn();
    await requirePermission('REVIEW_MODERATE')(req, {}, next);
    expect(next).toHaveBeenCalledWith();
    expect(pool.query).toHaveBeenCalledWith(expect.any(String), [2, 'REVIEW_MODERATE']);
  });
});

describe('requirePermission() — forbidden access', () => {
  it('403s PERMISSION_DENIED when the Staff session lacks the required permission', async () => {
    pool.query.mockResolvedValue([[]]);
    const req = { staffSession: { staffAdminUserId: 7, roleId: 2 } };
    const next = jest.fn();
    await requirePermission('REVIEW_MODERATE')(req, {}, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, code: 'PERMISSION_DENIED' })
    );
  });
});
