/**
 * delivery.concurrency.test.js
 * Simultaneous courier status updates on the SAME delivery.
 *
 * A small in-memory model of the database reproduces the two InnoDB
 * behaviours advanceStatus() relies on:
 *   - SELECT ... FOR UPDATE row locks: a second transaction waits until the
 *     first commits or rolls back, then reads the committed row;
 *   - writes are staged in the transaction and only become visible on COMMIT
 *     (a ROLLBACK discards them).
 * Requests are started in a known order and the lock queue is FIFO, so every
 * interleaving here is deterministic — no sleeps or timing assumptions.
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
  logActivity: jest.fn(),
}));

const { withTransaction } = require('../../../../../src/shared/db/connection');
const deliveryRepository = require('../../../../../src/modules/delivery-review/repositories/delivery.repository');
const orderService = require('../../../../../src/modules/customer-order/services/order.service');
const activityLogService = require('../../../../../src/modules/store-administration/services/activity-log.service');
const deliveryService = require('../../../../../src/modules/delivery-review/services/delivery.service');

function createFakeDatabase(initialStatus, orderStatus = 'READY_FOR_DELIVERY') {
  const db = { status: initialStatus, history: [], audit: [], commits: 0, rollbacks: 0, lockedDuringOrderCheck: [] };
  let lockHolder = null;
  const waiting = [];
  let nextTx = 0;

  const lock = (conn) => {
    if (lockHolder === null || lockHolder === conn) {
      lockHolder = conn;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      waiting.push(() => {
        lockHolder = conn;
        resolve();
      });
    });
  };
  const unlock = (conn) => {
    if (lockHolder !== conn) return;
    lockHolder = null;
    const next = waiting.shift();
    if (next) next();
  };

  withTransaction.mockImplementation(async (work) => {
    const conn = { tx: (nextTx += 1), staged: [] };
    try {
      const result = await work(conn);
      conn.staged.forEach((apply) => apply()); // COMMIT
      db.commits += 1;
      return result;
    } catch (err) {
      db.rollbacks += 1; // ROLLBACK: staged writes are discarded
      throw err;
    } finally {
      unlock(conn);
    }
  });

  const row = () => ({
    delivery_id: 1,
    order_id: 3,
    delivery_address: '42 Galle Road, Colombo 03',
    delivery_person_reference: 'Kasun',
    status: db.status,
    assigned_at: 'x',
  });
  deliveryRepository.findByIdForUpdate.mockImplementation(async (id, conn) => {
    await lock(conn);
    return row();
  });
  deliveryRepository.findById.mockImplementation(async () => row());
  deliveryRepository.findStatusHistory.mockImplementation(async () =>
    db.history.map((h) => ({ from_status: h.fromStatus, to_status: h.toStatus, actor_reference: h.actorReference, changed_at: 'x' }))
  );
  deliveryRepository.updateStatus.mockImplementation(async (id, status, expectedStatus, conn) => {
    if (db.status !== expectedStatus) return 0; // WHERE ... AND status = ? no longer matches
    conn.staged.push(() => {
      db.status = status;
    });
    return 1;
  });
  deliveryRepository.addStatusHistory.mockImplementation(async (entry, conn) => {
    conn.staged.push(() => db.history.push(entry));
  });
  activityLogService.logActivity.mockImplementation(async (entry, conn) => {
    if (!conn) throw new Error('activity log written outside the transaction');
    conn.staged.push(() => db.audit.push(entry));
  });
  orderService.getOrderDetail.mockImplementation(async () => {
    db.lockedDuringOrderCheck.push(lockHolder !== null);
    return { orderId: 3, customerId: 1, status: orderStatus, items: [] };
  });
  return db;
}

const outcome = (promise) => promise.then(() => 'SUCCESS', (err) => err.code);
const count = (list, value) => list.filter((x) => x === value).length;

beforeEach(() => jest.clearAllMocks());

describe('advanceStatus() — two simultaneous requests for the same transition', () => {
  it.each([
    ['ASSIGNED', 'HEADING_TO_STORE'],
    ['HEADING_TO_STORE', 'PICKED_UP'],
    ['PICKED_UP', 'OUT_FOR_DELIVERY'],
    ['OUT_FOR_DELIVERY', 'ARRIVED'],
    ['ARRIVED', 'DELIVERED'],
  ])('%s -> %s: exactly one succeeds and the other gets 409 DELIVERY_STATUS_CHANGED', async (from, to) => {
    const db = createFakeDatabase(from);

    const results = await Promise.all([
      outcome(deliveryService.advanceStatus(1, to)),
      outcome(deliveryService.advanceStatus(1, to)),
    ]);

    expect(count(results, 'SUCCESS')).toBe(1);
    expect(count(results, 'DELIVERY_STATUS_CHANGED')).toBe(1);
    expect(db.status).toBe(to);
    expect(db.history).toEqual([{ deliveryId: 1, fromStatus: from, toStatus: to, actorReference: 'Kasun' }]);
    expect(db.audit).toHaveLength(1);
    expect(db.audit[0]).toMatchObject({ actionType: `DELIVERY_STATUS_${to}`, affectedEntityId: 1 });
    expect(db.commits).toBe(1);
    expect(db.rollbacks).toBe(1);
  });

  it('never lets both succeed, even with five duplicate requests at once', async () => {
    const db = createFakeDatabase('ARRIVED');

    const results = await Promise.all(Array.from({ length: 5 }, () => outcome(deliveryService.advanceStatus(1, 'DELIVERED'))));

    expect(count(results, 'SUCCESS')).toBe(1);
    expect(count(results, 'DELIVERY_STATUS_CHANGED')).toBe(4);
    expect(db.status).toBe('DELIVERED');
    expect(db.history).toHaveLength(1);
    expect(db.audit).toHaveLength(1);
  });

  it('checks the order and the transition while holding the row lock', async () => {
    const db = createFakeDatabase('HEADING_TO_STORE');
    await Promise.all([outcome(deliveryService.advanceStatus(1, 'PICKED_UP')), outcome(deliveryService.advanceStatus(1, 'PICKED_UP'))]);
    expect(db.lockedDuringOrderCheck).toEqual([true, true]);
  });
});

describe('advanceStatus() — a stale request can no longer move the delivery backwards', () => {
  it('A (-> Picked Up), a duplicate B (-> Picked Up) and C (-> Out for Delivery) sent together: B is refused and the status only moves forwards', async () => {
    const db = createFakeDatabase('HEADING_TO_STORE');

    const [a, b, c] = await Promise.all([
      outcome(deliveryService.advanceStatus(1, 'PICKED_UP')),
      outcome(deliveryService.advanceStatus(1, 'PICKED_UP')),
      outcome(deliveryService.advanceStatus(1, 'OUT_FOR_DELIVERY')),
    ]);

    expect([a, b, c]).toEqual(['SUCCESS', 'DELIVERY_STATUS_CHANGED', 'SUCCESS']);
    expect(db.status).toBe('OUT_FOR_DELIVERY');
    expect(db.history.map((h) => `${h.fromStatus}->${h.toStatus}`)).toEqual([
      'HEADING_TO_STORE->PICKED_UP',
      'PICKED_UP->OUT_FOR_DELIVERY',
    ]);
    expect(db.audit).toHaveLength(2);
  });
});

describe('advanceStatus() — concurrent requests on a Cancelled order', () => {
  it('all get 422 ORDER_CANCELLED and nothing is written', async () => {
    const db = createFakeDatabase('OUT_FOR_DELIVERY', 'CANCELLED');

    const results = await Promise.all([
      outcome(deliveryService.advanceStatus(1, 'ARRIVED')),
      outcome(deliveryService.advanceStatus(1, 'ARRIVED')),
    ]);

    expect(results).toEqual(['ORDER_CANCELLED', 'ORDER_CANCELLED']);
    expect(db.status).toBe('OUT_FOR_DELIVERY');
    expect(db.history).toHaveLength(0);
    expect(db.audit).toHaveLength(0);
    expect(db.commits).toBe(0);
    expect(db.rollbacks).toBe(2);
  });
});
