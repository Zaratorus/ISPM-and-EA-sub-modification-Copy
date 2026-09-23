/**
 * activity-log.service.test.js
 * Verifies the single, central audit writer: field validation, default
 * handling for optional columns, and optional transaction-connection
 * passthrough (Detailed System Architecture V1.2 Section 19; Backend/API
 * Architecture Design V1.0 Sections 4/14).
 */

jest.mock('../../../../../src/modules/store-administration/repositories/activity-log.repository', () => ({
  insert: jest.fn().mockResolvedValue(undefined),
  findAll: jest.fn(),
}));

const activityLogRepository = require('../../../../../src/modules/store-administration/repositories/activity-log.repository');
const { logActivity, listActivityLog } = require('../../../../../src/modules/store-administration/services/activity-log.service');

describe('activity-log.service.logActivity()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('inserts a well-formed entry, defaulting omitted optional fields to null', async () => {
    await logActivity({
      actionType: 'STOCK_MANUAL_ADJUSTMENT',
      affectedEntityType: 'Product',
      affectedEntityId: 7,
      originatingModule: 'A',
      contextNote: 'recount',
    });

    expect(activityLogRepository.insert).toHaveBeenCalledTimes(1);
    expect(activityLogRepository.insert).toHaveBeenCalledWith(
      {
        actorType: null,
        actorId: null,
        actionType: 'STOCK_MANUAL_ADJUSTMENT',
        affectedEntityType: 'Product',
        affectedEntityId: 7,
        originatingModule: 'A',
        contextNote: 'recount',
      },
      undefined
    );
  });

  it('passes an optional transaction connection through unchanged, for atomic writes inside a caller transaction', async () => {
    const fakeConn = { query: jest.fn() };
    await logActivity(
      { actionType: 'ORDER_CONFIRMED', affectedEntityType: 'Order', affectedEntityId: 1, originatingModule: 'B' },
      fakeConn
    );
    expect(activityLogRepository.insert.mock.calls[0][1]).toBe(fakeConn);
  });

  it('accepts a valid actorType/actorId pair', async () => {
    await logActivity({
      actorType: 'OWNER_ADMIN',
      actionType: 'PRODUCT_CREATED',
      affectedEntityType: 'Product',
      affectedEntityId: 3,
      originatingModule: 'A',
    });
    expect(activityLogRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: 'OWNER_ADMIN', actorId: null }),
      undefined
    );
  });

  it.each([
    ['actionType', { affectedEntityType: 'Product', affectedEntityId: 1, originatingModule: 'A' }],
    ['affectedEntityType', { actionType: 'X', affectedEntityId: 1, originatingModule: 'A' }],
    ['affectedEntityId', { actionType: 'X', affectedEntityType: 'Product', originatingModule: 'A' }],
    ['originatingModule', { actionType: 'X', affectedEntityType: 'Product', affectedEntityId: 1 }],
  ])('rejects an entry missing %s, without ever calling the repository', async (_field, entry) => {
    await expect(logActivity(entry)).rejects.toThrow();
    expect(activityLogRepository.insert).not.toHaveBeenCalled();
  });

  it('rejects an invalid originatingModule (must be one of A/B/C/D/E)', async () => {
    await expect(
      logActivity({ actionType: 'X', affectedEntityType: 'Product', affectedEntityId: 1, originatingModule: 'Z' })
    ).rejects.toThrow(/invalid originatingModule/);
    expect(activityLogRepository.insert).not.toHaveBeenCalled();
  });

  it('rejects an invalid actorType', async () => {
    await expect(
      logActivity({
        actionType: 'X',
        affectedEntityType: 'Product',
        affectedEntityId: 1,
        originatingModule: 'A',
        actorType: 'HACKER',
      })
    ).rejects.toThrow(/invalid actorType/);
    expect(activityLogRepository.insert).not.toHaveBeenCalled();
  });
});

describe('activity-log.service.listActivityLog()', () => {
  beforeEach(() => jest.clearAllMocks());

  it('maps rows to DTOs and passes filters through to the repository', async () => {
    activityLogRepository.findAll.mockResolvedValue({
      rows: [
        {
          activity_log_id: 1,
          actor_type: 'OWNER_ADMIN',
          actor_id: null,
          action_type: 'STAFF_CREATED',
          affected_entity_type: 'StaffAdminUser',
          affected_entity_id: 5,
          originating_module: 'D',
          context_note: null,
          timestamp: '2026-01-01',
        },
      ],
      total: 1,
    });

    const result = await listActivityLog({ originatingModule: 'D', actionType: 'STAFF_CREATED', page: 1, limit: 20 });

    expect(activityLogRepository.findAll).toHaveBeenCalledWith({
      originatingModule: 'D',
      actionType: 'STAFF_CREATED',
      page: 1,
      limit: 20,
    });
    expect(result.data).toEqual([
      {
        activityLogId: 1,
        actorType: 'OWNER_ADMIN',
        actorId: null,
        actionType: 'STAFF_CREATED',
        affectedEntityType: 'StaffAdminUser',
        affectedEntityId: 5,
        originatingModule: 'D',
        contextNote: null,
        timestamp: '2026-01-01',
      },
    ]);
    expect(result.meta).toEqual({ page: 1, limit: 20, total: 1 });
  });
});
