/**
 * review.concurrency.test.js
 * Simultaneous customer edits/deletes, admin moderation and submissions on
 * the same review/purchase.
 *
 * A small in-memory model of the database reproduces the InnoDB behaviours
 * review.service.js relies on:
 *   - SELECT ... FOR UPDATE row locks: a second transaction waits until the
 *     first commits or rolls back, then reads the committed row;
 *   - writes are staged and only become visible on COMMIT (ROLLBACK discards them).
 * Requests start in a known order and each lock queue is FIFO, so every
 * interleaving here is deterministic — no sleeps or timing assumptions.
 */

jest.mock('../../../../../src/shared/db/connection', () => ({
  pool: { query: jest.fn() },
  withTransaction: jest.fn(),
}));
jest.mock('../../../../../src/modules/delivery-review/repositories/review.repository', () => ({
  create: jest.fn(),
  findById: jest.fn(),
  findByIdForUpdate: jest.fn(),
  findActiveForPurchase: jest.fn(),
  findByCustomerId: jest.fn(),
  findApprovedByProductId: jest.fn(),
  getAverageApprovedRating: jest.fn(),
  findByModerationStatus: jest.fn(),
  updateModerationStatus: jest.fn(),
  updateOwnReviewContent: jest.fn(),
  insertModerationLog: jest.fn(),
}));
jest.mock('../../../../../src/modules/delivery-review/repositories/delivery.repository', () => ({
  findByOrderId: jest.fn(),
  findByIdForUpdate: jest.fn(),
}));
jest.mock('../../../../../src/modules/customer-order/services/order.service', () => ({
  getOrderDetail: jest.fn(),
}));
jest.mock('../../../../../src/modules/product-catalogue/services/inventory.service', () => ({
  getProduct: jest.fn(),
}));
jest.mock('../../../../../src/modules/store-administration/services/activity-log.service', () => ({
  logActivity: jest.fn(),
}));

const { withTransaction } = require('../../../../../src/shared/db/connection');
const reviewRepository = require('../../../../../src/modules/delivery-review/repositories/review.repository');
const deliveryRepository = require('../../../../../src/modules/delivery-review/repositories/delivery.repository');
const orderService = require('../../../../../src/modules/customer-order/services/order.service');
const inventoryService = require('../../../../../src/modules/product-catalogue/services/inventory.service');
const activityLogService = require('../../../../../src/modules/store-administration/services/activity-log.service');
const reviewService = require('../../../../../src/modules/delivery-review/services/review.service');

const CUSTOMER = 10;
const admin = { actorType: 'OWNER_ADMIN', actorId: null };

function createFakeDatabase(initialReviews = []) {
  const db = {
    reviews: new Map(initialReviews.map((r) => [r.review_id, { ...r }])),
    moderationLogs: [],
    audit: [],
    commits: 0,
    rollbacks: 0,
    nextId: 100,
  };
  const holders = new Map();
  const queues = new Map();

  const lock = (key, conn) => {
    const holder = holders.get(key);
    if (!holder || holder === conn) {
      holders.set(key, conn);
      conn.locks.add(key);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      if (!queues.has(key)) queues.set(key, []);
      queues.get(key).push(() => {
        holders.set(key, conn);
        conn.locks.add(key);
        resolve();
      });
    });
  };
  const unlockAll = (conn) => {
    for (const key of [...conn.locks]) {
      holders.delete(key);
      const next = (queues.get(key) || []).shift();
      if (next) next();
    }
    conn.locks.clear();
  };

  withTransaction.mockImplementation(async (work) => {
    const conn = { staged: [], locks: new Set() };
    try {
      const result = await work(conn);
      conn.staged.forEach((apply) => apply()); // COMMIT
      db.commits += 1;
      return result;
    } catch (err) {
      db.rollbacks += 1; // ROLLBACK: staged writes are discarded
      throw err;
    } finally {
      unlockAll(conn);
    }
  });

  const copy = (id) => (db.reviews.has(id) ? { ...db.reviews.get(id) } : null);
  reviewRepository.findByIdForUpdate.mockImplementation(async (id, conn) => {
    await lock(`review:${id}`, conn);
    return copy(id);
  });
  reviewRepository.findById.mockImplementation(async (id) => copy(id));
  reviewRepository.updateOwnReviewContent.mockImplementation(async ({ reviewId, customerId, rating, reviewText, expectedStatus }, conn) => {
    const row = db.reviews.get(reviewId);
    if (!row || row.customer_id !== customerId || row.moderation_status !== expectedStatus) return 0;
    conn.staged.push(() => Object.assign(row, { rating, review_text: reviewText, moderation_status: 'PENDING_MODERATION' }));
    return 1;
  });
  reviewRepository.updateModerationStatus.mockImplementation(async (id, status, expectedStatus, conn) => {
    const row = db.reviews.get(id);
    if (!row || row.moderation_status !== expectedStatus) return 0;
    conn.staged.push(() => {
      row.moderation_status = status;
    });
    return 1;
  });
  reviewRepository.insertModerationLog.mockImplementation(async (entry, conn) => {
    conn.staged.push(() => db.moderationLogs.push(entry.action));
  });
  reviewRepository.findActiveForPurchase.mockImplementation(
    async ({ customerId, productId, orderId }) =>
      [...db.reviews.values()].find(
        (r) => r.customer_id === customerId && r.product_id === productId && r.order_id === orderId && r.moderation_status !== 'DELETED'
      ) || null
  );
  reviewRepository.create.mockImplementation(async (data, conn) => {
    db.nextId += 1;
    const row = {
      review_id: db.nextId,
      customer_id: data.customerId,
      product_id: data.productId,
      order_id: data.orderId,
      rating: data.rating,
      review_text: data.reviewText ?? null,
      moderation_status: 'PENDING_MODERATION',
      created_at: 'x',
    };
    conn.staged.push(() => db.reviews.set(row.review_id, row));
    return { ...row };
  });
  deliveryRepository.findByOrderId.mockResolvedValue({ delivery_id: 1, order_id: 100, status: 'DELIVERED' });
  deliveryRepository.findByIdForUpdate.mockImplementation(async (id, conn) => {
    await lock(`delivery:${id}`, conn);
    return { delivery_id: id, order_id: 100, status: 'DELIVERED' };
  });
  activityLogService.logActivity.mockImplementation(async (entry, conn) => {
    if (!conn) throw new Error('activity log written outside the transaction');
    conn.staged.push(() => db.audit.push(entry.actionType));
  });
  orderService.getOrderDetail.mockResolvedValue({ orderId: 100, customerId: CUSTOMER, status: 'READY_FOR_DELIVERY', items: [{ productId: 5 }] });
  inventoryService.getProduct.mockResolvedValue({ product_id: 5, name: 'Oversized Tee' });
  return db;
}

function review(status) {
  return {
    review_id: 7,
    customer_id: CUSTOMER,
    product_id: 5,
    order_id: 100,
    rating: 4,
    review_text: 'Original text',
    moderation_status: status,
    created_at: 'x',
  };
}
const outcome = (promise) => promise.then(() => 'SUCCESS', (err) => err.code);
const edit = () => outcome(reviewService.updateOwnReview(CUSTOMER, 7, { rating: 2, reviewText: 'Edited text' }));
const moderate = (action) => outcome(reviewService.moderateReview(7, action, admin));
const customerDelete = () => outcome(reviewService.deleteOwnReview(CUSTOMER, 7));

beforeEach(() => jest.clearAllMocks());

describe('36. customer edit vs admin moderation never silently overwrite each other', () => {
  it('edit of an APPROVED review, then an admin DELETE sent together: the edit lands first, the delete then applies to the edited version', async () => {
    const db = createFakeDatabase([review('APPROVED')]);
    expect(await Promise.all([edit(), moderate('DELETE')])).toEqual(['SUCCESS', 'SUCCESS']);
    expect(db.reviews.get(7)).toMatchObject({ moderation_status: 'DELETED', review_text: 'Edited text', rating: 2 });
    expect(db.audit).toEqual(['REVIEW_EDITED', 'REVIEW_DELETED']);
    expect(db.moderationLogs).toEqual(['DELETE']);
  });

  it('admin DELETE, then an edit sent together: the edit is refused (422 REVIEW_DELETED) and nothing of it is written', async () => {
    const db = createFakeDatabase([review('APPROVED')]);
    expect(await Promise.all([moderate('DELETE'), edit()])).toEqual(['SUCCESS', 'REVIEW_DELETED']);
    expect(db.reviews.get(7)).toMatchObject({ moderation_status: 'DELETED', review_text: 'Original text', rating: 4 });
    expect(db.audit).toEqual(['REVIEW_DELETED']);
    expect(db.rollbacks).toBe(1);
  });

  it('admin APPROVE, then an edit of the same PENDING review: the edited version goes back to moderation instead of staying public', async () => {
    const db = createFakeDatabase([review('PENDING_MODERATION')]);
    expect(await Promise.all([moderate('APPROVE'), edit()])).toEqual(['SUCCESS', 'SUCCESS']);
    expect(db.reviews.get(7)).toMatchObject({ moderation_status: 'PENDING_MODERATION', review_text: 'Edited text' });
    expect(db.moderationLogs).toEqual(['APPROVE']);
    expect(db.audit).toEqual(['REVIEW_APPROVED', 'REVIEW_EDITED']);
  });

  it('37. customer DELETE, then an admin APPROVE: the admin check runs on the locked, now-DELETED row and is refused — a deleted review is never approved', async () => {
    const db = createFakeDatabase([review('PENDING_MODERATION')]);
    expect(await Promise.all([customerDelete(), moderate('APPROVE')])).toEqual(['SUCCESS', 'INVALID_MODERATION_ACTION']);
    expect(db.reviews.get(7).moderation_status).toBe('DELETED');
    expect(db.moderationLogs).toEqual([]);
    expect(db.audit).toEqual(['REVIEW_DELETED_BY_CUSTOMER']);
  });

  it('two admins approving the same PENDING review at once: exactly one moderation is recorded', async () => {
    const db = createFakeDatabase([review('PENDING_MODERATION')]);
    const results = await Promise.all([moderate('APPROVE'), moderate('APPROVE')]);
    expect(results.sort()).toEqual(['INVALID_MODERATION_ACTION', 'SUCCESS']);
    expect(db.reviews.get(7).moderation_status).toBe('APPROVED');
    expect(db.moderationLogs).toEqual(['APPROVE']);
    expect(db.audit).toEqual(['REVIEW_APPROVED']);
  });

  it('the same customer deleting from two tabs at once: one succeeds, the other gets REVIEW_ALREADY_DELETED', async () => {
    const db = createFakeDatabase([review('APPROVED')]);
    expect(await Promise.all([customerDelete(), customerDelete()])).toEqual(['SUCCESS', 'REVIEW_ALREADY_DELETED']);
    expect(db.audit).toEqual(['REVIEW_DELETED_BY_CUSTOMER']);
  });
});

describe('simultaneous submissions for the same purchase', () => {
  it('only one review is created; the other gets 409 REVIEW_ALREADY_EXISTS', async () => {
    const db = createFakeDatabase();
    const submit = () => outcome(reviewService.submitReview(CUSTOMER, { orderId: 100, productId: 5, rating: 5 }));

    const results = await Promise.all([submit(), submit()]);

    expect(results).toEqual(['SUCCESS', 'REVIEW_ALREADY_EXISTS']);
    expect([...db.reviews.values()]).toHaveLength(1);
    expect(db.audit).toEqual(['REVIEW_SUBMITTED']);
  });

  it('a new review is allowed once the previous one for that purchase was deleted', async () => {
    const db = createFakeDatabase([review('DELETED')]);
    await expect(reviewService.submitReview(CUSTOMER, { orderId: 100, productId: 5, rating: 3 })).resolves.toMatchObject({
      moderationStatus: 'PENDING_MODERATION',
    });
    expect([...db.reviews.values()].map((r) => r.moderation_status).sort()).toEqual(['DELETED', 'PENDING_MODERATION']);
  });
});
