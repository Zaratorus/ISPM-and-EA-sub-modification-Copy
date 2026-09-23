/**
 * delivery.service.test.js
 * Verifies: EP-02 read boundary (ownership check and delivery-address
 * sourcing both go through Module B's exposed
 * order.service.js.getOrderDetail(), never a direct read of Module B's
 * tables), the Ready-for-Delivery handover precondition for creation, and
 * the courier status update: the delivery row is read under a row lock
 * inside one transaction, the 6-stage transition rule is checked against
 * that locked row, the UPDATE is conditional on the old status, and the
 * history row and Activity Log entry are written on the same transaction.
 * (Simultaneous requests are covered in delivery.concurrency.test.js.)
 */

jest.mock('../../../../../src/shared/db/connection', () => ({
  pool: { query: jest.fn() },
  withTransaction: jest.fn(),
}));
jest.mock('../../../../../src/modules/delivery-review/repositories/delivery.repository', () => ({
  create: jest.fn(),
  findById: jest.fn(),
  findByIdForUpdate: jest.fn(),
  findByOrderId: jest.fn(),
  updateStatus: jest.fn(),
  addStatusHistory: jest.fn(),
  findStatusHistory: jest.fn(),
}));
jest.mock('../../../../../src/modules/customer-order/services/order.service', () => ({
  getOrderDetail: jest.fn(),
}));
jest.mock('../../../../../src/modules/store-administration/services/activity-log.service', () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

const { withTransaction } = require('../../../../../src/shared/db/connection');
const deliveryRepository = require('../../../../../src/modules/delivery-review/repositories/delivery.repository');
const orderService = require('../../../../../src/modules/customer-order/services/order.service');
const activityLogService = require('../../../../../src/modules/store-administration/services/activity-log.service');
const deliveryService = require('../../../../../src/modules/delivery-review/services/delivery.service');

const fakeConn = { query: jest.fn() };
const tx = { commits: 0, rollbacks: 0 };

function lockedRow(status, deliveryPersonReference = 'Kasun') {
  return {
    delivery_id: 1,
    status,
    order_id: 100,
    delivery_address: 'x',
    delivery_person_reference: deliveryPersonReference,
    assigned_at: 'x',
  };
}

function expectNothingWritten() {
  expect(deliveryRepository.updateStatus).not.toHaveBeenCalled();
  expect(deliveryRepository.addStatusHistory).not.toHaveBeenCalled();
  expect(deliveryRepository.create).not.toHaveBeenCalled();
  expect(activityLogService.logActivity).not.toHaveBeenCalled();
}

beforeEach(() => {
  jest.clearAllMocks();
  tx.commits = 0;
  tx.rollbacks = 0;
  // Same contract as the real withTransaction(): commit on success, roll back on any error.
  withTransaction.mockImplementation(async (work) => {
    try {
      const result = await work(fakeConn);
      tx.commits += 1;
      return result;
    } catch (err) {
      tx.rollbacks += 1;
      throw err;
    }
  });
  deliveryRepository.findStatusHistory.mockResolvedValue([]);
  deliveryRepository.updateStatus.mockResolvedValue(1); // one row updated
  // advanceStatus() checks the delivery's order; default to a live (not Cancelled) order.
  orderService.getOrderDetail.mockResolvedValue({ orderId: 100, customerId: 10, status: 'READY_FOR_DELIVERY', items: [] });
});

describe('delivery.service.getDeliveryById() / getDeliveryByOrderId()', () => {
  it('404s when no delivery exists for the given id', async () => {
    deliveryRepository.findById.mockResolvedValue(null);
    await expect(deliveryService.getDeliveryById(1)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('404s when no delivery exists yet for the given order', async () => {
    deliveryRepository.findByOrderId.mockResolvedValue(null);
    await expect(deliveryService.getDeliveryByOrderId(1)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('maps the DB row to a camelCase DTO, with an empty history array when none exists yet', async () => {
    deliveryRepository.findById.mockResolvedValue({
      delivery_id: 5,
      order_id: 100,
      delivery_address: '123 Main St',
      delivery_person_reference: null,
      status: 'ASSIGNED',
      assigned_at: '2026-01-01',
    });
    const result = await deliveryService.getDeliveryById(5);
    expect(result).toEqual({
      deliveryId: 5,
      orderId: 100,
      deliveryAddress: '123 Main St',
      deliveryPersonReference: null,
      status: 'ASSIGNED',
      assignedAt: '2026-01-01',
      history: [],
    });
  });

  it('includes the full status-transition history, camelCased — "what happened through the process" (project-owner decision, 2026-09-12)', async () => {
    deliveryRepository.findById.mockResolvedValue({
      delivery_id: 5,
      order_id: 100,
      delivery_address: '123 Main St',
      delivery_person_reference: 'Kasun',
      status: 'PICKED_UP',
      assigned_at: '2026-01-01',
    });
    deliveryRepository.findStatusHistory.mockResolvedValue([
      { from_status: 'ASSIGNED', to_status: 'HEADING_TO_STORE', actor_reference: 'Kasun', changed_at: '2026-01-01T01:00:00' },
      { from_status: 'HEADING_TO_STORE', to_status: 'PICKED_UP', actor_reference: 'Kasun', changed_at: '2026-01-01T01:05:00' },
    ]);

    const result = await deliveryService.getDeliveryById(5);

    expect(deliveryRepository.findStatusHistory).toHaveBeenCalledWith(5);
    expect(result.history).toEqual([
      { fromStatus: 'ASSIGNED', toStatus: 'HEADING_TO_STORE', actorReference: 'Kasun', changedAt: '2026-01-01T01:00:00' },
      { fromStatus: 'HEADING_TO_STORE', toStatus: 'PICKED_UP', actorReference: 'Kasun', changedAt: '2026-01-01T01:05:00' },
    ]);
  });
});

describe('delivery.service.createDelivery() — Ready-for-Delivery handover', () => {
  const admin = { actorType: 'OWNER_ADMIN', actorId: null };

  it('reads the Order (status + delivery address) via order.service.js.getOrderDetail() only — never a direct Module B table read', async () => {
    orderService.getOrderDetail.mockResolvedValue({
      orderId: 100,
      status: 'READY_FOR_DELIVERY',
      deliveryAddress: '123 Main St, Colombo',
    });
    deliveryRepository.findByOrderId.mockResolvedValue(null);
    deliveryRepository.create.mockResolvedValue({
      delivery_id: 1,
      order_id: 100,
      delivery_address: '123 Main St, Colombo',
      delivery_person_reference: null,
      status: 'ASSIGNED',
      assigned_at: 'x',
    });

    await deliveryService.createDelivery({ orderId: 100 }, admin);

    expect(orderService.getOrderDetail).toHaveBeenCalledWith(100);
  });

  it('422s ORDER_NOT_READY_FOR_DELIVERY when the order has not reached Ready for Delivery', async () => {
    orderService.getOrderDetail.mockResolvedValue({ orderId: 100, status: 'CONFIRMED', deliveryAddress: 'x' });

    await expect(deliveryService.createDelivery({ orderId: 100 }, admin)).rejects.toMatchObject({
      statusCode: 422,
      code: 'ORDER_NOT_READY_FOR_DELIVERY',
    });
    expect(deliveryRepository.create).not.toHaveBeenCalled();
  });

  it('409s DELIVERY_ALREADY_EXISTS when a Delivery already exists for the order', async () => {
    orderService.getOrderDetail.mockResolvedValue({
      orderId: 100,
      status: 'READY_FOR_DELIVERY',
      deliveryAddress: '123 Main St',
    });
    deliveryRepository.findByOrderId.mockResolvedValue({ delivery_id: 1 });

    await expect(deliveryService.createDelivery({ orderId: 100 }, admin)).rejects.toMatchObject({
      statusCode: 409,
      code: 'DELIVERY_ALREADY_EXISTS',
    });
    expect(deliveryRepository.create).not.toHaveBeenCalled();
  });

  it("snapshots the Order's deliveryAddress into the new Delivery row — never re-reads Customer, never a live link", async () => {
    orderService.getOrderDetail.mockResolvedValue({
      orderId: 100,
      status: 'READY_FOR_DELIVERY',
      deliveryAddress: '123 Main St, Colombo',
    });
    deliveryRepository.findByOrderId.mockResolvedValue(null);
    deliveryRepository.create.mockResolvedValue({
      delivery_id: 1,
      order_id: 100,
      delivery_address: '123 Main St, Colombo',
      delivery_person_reference: null,
      status: 'ASSIGNED',
      assigned_at: 'x',
    });

    const result = await deliveryService.createDelivery({ orderId: 100 }, admin);

    expect(deliveryRepository.create).toHaveBeenCalledWith({
      orderId: 100,
      deliveryAddress: '123 Main St, Colombo',
      deliveryPersonReference: null,
    });
    expect(result.deliveryAddress).toBe('123 Main St, Colombo');
    expect(activityLogService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'DELIVERY_CREATED', originatingModule: 'C', affectedEntityId: 1 })
    );
  });

  it('passes deliveryPersonReference through when provided, without inventing a Delivery Person mechanism', async () => {
    orderService.getOrderDetail.mockResolvedValue({
      orderId: 100,
      status: 'READY_FOR_DELIVERY',
      deliveryAddress: '123 Main St',
    });
    deliveryRepository.findByOrderId.mockResolvedValue(null);
    deliveryRepository.create.mockResolvedValue({
      delivery_id: 1,
      order_id: 100,
      delivery_address: '123 Main St',
      delivery_person_reference: 'Kasun',
      status: 'ASSIGNED',
      assigned_at: 'x',
    });

    await deliveryService.createDelivery({ orderId: 100, deliveryPersonReference: 'Kasun' }, admin);

    expect(deliveryRepository.create).toHaveBeenCalledWith({
      orderId: 100,
      deliveryAddress: '123 Main St',
      deliveryPersonReference: 'Kasun',
    });
  });
});

describe('delivery.service.assertCustomerOwnsDelivery() — EP-02 read boundary', () => {
  it('reads ownership via order.service.js.getOrderDetail() only — never a direct Module B table read', async () => {
    orderService.getOrderDetail.mockResolvedValue({ orderId: 100, customerId: 10 });
    await deliveryService.assertCustomerOwnsDelivery({ orderId: 100 }, 10);
    expect(orderService.getOrderDetail).toHaveBeenCalledWith(100);
  });

  it('403s when the delivery\'s order belongs to a different customer', async () => {
    orderService.getOrderDetail.mockResolvedValue({ orderId: 100, customerId: 999 });
    await expect(deliveryService.assertCustomerOwnsDelivery({ orderId: 100 }, 10)).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

describe('delivery.service.advanceStatus() — locked row, conditional update, history + audit in one transaction', () => {
  it('404s when the delivery does not exist, and rolls back', async () => {
    deliveryRepository.findByIdForUpdate.mockResolvedValue(null);

    await expect(deliveryService.advanceStatus(1, 'HEADING_TO_STORE')).rejects.toMatchObject({ statusCode: 404 });
    expect(tx).toEqual({ commits: 0, rollbacks: 1 });
    expectNothingWritten();
  });

  it('reads the delivery only through the row lock, on the transaction connection, before checking the order', async () => {
    deliveryRepository.findByIdForUpdate.mockResolvedValue(lockedRow('ASSIGNED'));
    deliveryRepository.findById.mockResolvedValue(lockedRow('HEADING_TO_STORE'));

    await deliveryService.advanceStatus(1, 'HEADING_TO_STORE');

    expect(deliveryRepository.findByIdForUpdate).toHaveBeenCalledWith(1, fakeConn);
    expect(deliveryRepository.findByIdForUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      orderService.getOrderDetail.mock.invocationCallOrder[0]
    );
    // The only plain (unlocked) read is the response re-read after COMMIT.
    expect(deliveryRepository.findById).toHaveBeenCalledTimes(1);
    expect(deliveryRepository.findById.mock.invocationCallOrder[0]).toBeGreaterThan(
      activityLogService.logActivity.mock.invocationCallOrder[0]
    );
  });

  it.each([
    ['ASSIGNED', 'HEADING_TO_STORE'],
    ['HEADING_TO_STORE', 'PICKED_UP'],
    ['PICKED_UP', 'OUT_FOR_DELIVERY'],
    ['OUT_FOR_DELIVERY', 'ARRIVED'],
    ['ARRIVED', 'DELIVERED'],
  ])('1-5. %s -> %s succeeds: conditional update, history and activity log on the same transaction, then COMMIT', async (from, to) => {
    deliveryRepository.findByIdForUpdate.mockResolvedValue(lockedRow(from));
    deliveryRepository.findById.mockResolvedValue(lockedRow(to));

    const result = await deliveryService.advanceStatus(1, to);

    expect(deliveryRepository.updateStatus).toHaveBeenCalledWith(1, to, from, fakeConn);
    expect(deliveryRepository.addStatusHistory).toHaveBeenCalledWith(
      { deliveryId: 1, fromStatus: from, toStatus: to, actorReference: 'Kasun' },
      fakeConn
    );
    // activity_log.actor_type has no Delivery Person value (VALID_ACTOR_TYPES
    // is STAFF_ADMIN_USER/OWNER_ADMIN/SYSTEM only) — null/null + contextNote.
    expect(activityLogService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: `DELIVERY_STATUS_${to}`,
        affectedEntityType: 'Delivery',
        affectedEntityId: 1,
        originatingModule: 'C',
        actorType: null,
        actorId: null,
        contextNote: 'Advanced by Kasun.',
      }),
      fakeConn
    );
    expect(tx).toEqual({ commits: 1, rollbacks: 0 });
    expect(result.status).toBe(to);
  });

  it('falls back to a generic actor reference when no delivery_person_reference was recorded', async () => {
    deliveryRepository.findByIdForUpdate.mockResolvedValue(lockedRow('HEADING_TO_STORE', null));
    deliveryRepository.findById.mockResolvedValue(lockedRow('PICKED_UP', null));

    await deliveryService.advanceStatus(1, 'PICKED_UP');

    expect(deliveryRepository.addStatusHistory).toHaveBeenCalledWith(
      expect.objectContaining({ actorReference: 'Delivery Person (unidentified)' }),
      fakeConn
    );
    expect(activityLogService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ contextNote: 'Advanced by Delivery Person (unidentified).' }),
      fakeConn
    );
  });

  it.each([
    ['ASSIGNED', 'DELIVERED', 'out of sequence'],
    ['PICKED_UP', 'ARRIVED', 'skipping a stage'],
    ['DELIVERED', 'PICKED_UP', 'going backwards'],
    ['ARRIVED', 'HEADING_TO_STORE', 'going backwards'],
  ])('6. still rejects %s -> %s (%s) with 422 INVALID_DELIVERY_TRANSITION, writes nothing and rolls back', async (from, to) => {
    deliveryRepository.findByIdForUpdate.mockResolvedValue(lockedRow(from));

    await expect(deliveryService.advanceStatus(1, to)).rejects.toMatchObject({
      statusCode: 422,
      code: 'INVALID_DELIVERY_TRANSITION',
    });
    expectNothingWritten();
    expect(tx).toEqual({ commits: 0, rollbacks: 1 });
  });

  it('409s DELIVERY_STATUS_CHANGED when the locked row already has the requested status (a concurrent request just applied it)', async () => {
    deliveryRepository.findByIdForUpdate.mockResolvedValue(lockedRow('PICKED_UP'));

    await expect(deliveryService.advanceStatus(1, 'PICKED_UP')).rejects.toMatchObject({
      statusCode: 409,
      code: 'DELIVERY_STATUS_CHANGED',
      message: 'This delivery was just updated — refresh and try again.',
    });
    expectNothingWritten();
    expect(tx).toEqual({ commits: 0, rollbacks: 1 });
  });
});

describe('delivery.service.advanceStatus() — conditional UPDATE affects 0 rows (defense in depth)', () => {
  beforeEach(() => {
    deliveryRepository.findByIdForUpdate.mockResolvedValue(lockedRow('PICKED_UP'));
    deliveryRepository.updateStatus.mockResolvedValue(0);
  });

  it('8/9. 409s DELIVERY_STATUS_CHANGED with the documented message', async () => {
    await expect(deliveryService.advanceStatus(1, 'OUT_FOR_DELIVERY')).rejects.toMatchObject({
      statusCode: 409,
      code: 'DELIVERY_STATUS_CHANGED',
      message: 'This delivery was just updated — refresh and try again.',
    });
    expect(deliveryRepository.updateStatus).toHaveBeenCalledWith(1, 'OUT_FOR_DELIVERY', 'PICKED_UP', fakeConn);
  });

  it('10/11/12. inserts no history row, writes no activity log, and rolls the transaction back', async () => {
    await expect(deliveryService.advanceStatus(1, 'OUT_FOR_DELIVERY')).rejects.toMatchObject({ code: 'DELIVERY_STATUS_CHANGED' });

    expect(deliveryRepository.addStatusHistory).not.toHaveBeenCalled();
    expect(activityLogService.logActivity).not.toHaveBeenCalled();
    expect(tx).toEqual({ commits: 0, rollbacks: 1 });
    expect(deliveryRepository.findById).not.toHaveBeenCalled(); // no response re-read after a failure
  });
});

describe('delivery.service.advanceStatus() — a Cancelled order freezes its delivery (Step 7B, now on the locked row)', () => {
  const cancelledOrder = { orderId: 100, customerId: 10, status: 'CANCELLED', items: [] };

  it('normal progression still works: reads the order and advances when it is not Cancelled', async () => {
    deliveryRepository.findByIdForUpdate.mockResolvedValue(lockedRow('PICKED_UP'));
    deliveryRepository.findById.mockResolvedValue(lockedRow('OUT_FOR_DELIVERY'));

    await deliveryService.advanceStatus(1, 'OUT_FOR_DELIVERY');

    expect(orderService.getOrderDetail).toHaveBeenCalledWith(100);
    expect(deliveryRepository.updateStatus).toHaveBeenCalledWith(1, 'OUT_FOR_DELIVERY', 'PICKED_UP', fakeConn);
  });

  it.each([
    ['ASSIGNED', 'HEADING_TO_STORE'],
    ['HEADING_TO_STORE', 'PICKED_UP'],
    ['PICKED_UP', 'OUT_FOR_DELIVERY'],
    ['OUT_FOR_DELIVERY', 'ARRIVED'],
  ])('7. 422s ORDER_CANCELLED for the otherwise-legal step %s -> %s once the order is Cancelled', async (from, to) => {
    deliveryRepository.findByIdForUpdate.mockResolvedValue(lockedRow(from));
    orderService.getOrderDetail.mockResolvedValue(cancelledOrder);

    await expect(deliveryService.advanceStatus(1, to)).rejects.toMatchObject({ statusCode: 422, code: 'ORDER_CANCELLED' });
  });

  it('a Cancelled order cannot reach Delivered (Arrived -> Delivered is refused with a clear message)', async () => {
    deliveryRepository.findByIdForUpdate.mockResolvedValue(lockedRow('ARRIVED'));
    orderService.getOrderDetail.mockResolvedValue(cancelledOrder);

    await expect(deliveryService.advanceStatus(1, 'DELIVERED')).rejects.toMatchObject({
      statusCode: 422,
      code: 'ORDER_CANCELLED',
      message: 'Order 100 has been cancelled, so delivery 1 can no longer be updated.',
    });
    expect(deliveryRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('leaves the delivery record untouched when refused: the transaction rolls back with no update, history row or audit entry', async () => {
    deliveryRepository.findByIdForUpdate.mockResolvedValue(lockedRow('OUT_FOR_DELIVERY'));
    orderService.getOrderDetail.mockResolvedValue(cancelledOrder);

    await expect(deliveryService.advanceStatus(1, 'ARRIVED')).rejects.toMatchObject({ code: 'ORDER_CANCELLED' });

    expect(tx).toEqual({ commits: 0, rollbacks: 1 });
    expectNothingWritten();
  });

  it('reports ORDER_CANCELLED even for a transition that would otherwise be invalid (the freeze is checked first)', async () => {
    deliveryRepository.findByIdForUpdate.mockResolvedValue(lockedRow('ASSIGNED'));
    orderService.getOrderDetail.mockResolvedValue(cancelledOrder);

    await expect(deliveryService.advanceStatus(1, 'DELIVERED')).rejects.toMatchObject({ code: 'ORDER_CANCELLED' });
  });
});

describe('delivery.service.getDeliveryStatusForOrder() — read used by order cancellation', () => {
  it("returns the order's delivery status", async () => {
    deliveryRepository.findByOrderId.mockResolvedValue({ delivery_id: 1, order_id: 100, status: 'DELIVERED' });
    await expect(deliveryService.getDeliveryStatusForOrder(100)).resolves.toBe('DELIVERED');
    expect(deliveryRepository.findByOrderId).toHaveBeenCalledWith(100);
  });

  it('returns null when the order has no delivery yet', async () => {
    deliveryRepository.findByOrderId.mockResolvedValue(null);
    await expect(deliveryService.getDeliveryStatusForOrder(100)).resolves.toBeNull();
  });
});
