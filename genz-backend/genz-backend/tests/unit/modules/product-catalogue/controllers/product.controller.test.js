/**
 * product.controller.test.js
 * Covers actorFromRequest(), now living in shared/utils/actor-from-
 * request.js (extracted from here once Module B's order controller needed
 * the identical logic). This remains the only test file for the helper —
 * kept under this path since product.controller.js is what originally
 * motivated writing it.
 */

const actorFromRequest = require('../../../../../src/shared/utils/actor-from-request');

describe('actorFromRequest()', () => {
  it('resolves OWNER_ADMIN with a null actorId for an Access-Key-derived admin session', () => {
    const req = { adminSession: { type: 'OWNER_ADMIN' } };
    expect(actorFromRequest(req)).toEqual({ actorType: 'OWNER_ADMIN', actorId: null });
  });

  it('resolves STAFF_ADMIN_USER with the staff id, once Staff sessions exist (forward-compatible, OPEN item 1)', () => {
    const req = { staffSession: { staffAdminUserId: 99, roleId: 2 } };
    expect(actorFromRequest(req)).toEqual({ actorType: 'STAFF_ADMIN_USER', actorId: 99 });
  });

  it('falls back to SYSTEM when neither session is present', () => {
    expect(actorFromRequest({})).toEqual({ actorType: 'SYSTEM', actorId: null });
  });

  it('prefers adminSession over staffSession if both are somehow present', () => {
    const req = { adminSession: { type: 'OWNER_ADMIN' }, staffSession: { staffAdminUserId: 5 } };
    expect(actorFromRequest(req)).toEqual({ actorType: 'OWNER_ADMIN', actorId: null });
  });
});
