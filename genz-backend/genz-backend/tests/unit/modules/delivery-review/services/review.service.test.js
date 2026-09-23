/**
 * review.service.test.js
 * Verifies: submission eligibility (ownership, not Cancelled, verified
 * purchase via Module B's order.service.js.getOrderDetail(), Delivered via
 * Module C's own delivery data) and the one-active-review rule; customer
 * self-service (list / edit / soft-delete own reviews) with 404 for anyone
 * else's review; the public approved-only listing without customer/order
 * identifiers; the admin list filter; and the moderation state rules. Every
 * mutation runs on a row locked inside one transaction, with the Activity
 * Log written on that transaction. Simultaneous requests are covered in
 * review.concurrency.test.js.
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
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

const { withTransaction } = require('../../../../../src/shared/db/connection');
const ApiError = require('../../../../../src/shared/utils/ApiError');
const reviewRepository = require('../../../../../src/modules/delivery-review/repositories/review.repository');
const deliveryRepository = require('../../../../../src/modules/delivery-review/repositories/delivery.repository');
const orderService = require('../../../../../src/modules/customer-order/services/order.service');
const inventoryService = require('../../../../../src/modules/product-catalogue/services/inventory.service');
const activityLogService = require('../../../../../src/modules/store-administration/services/activity-log.service');
const reviewService = require('../../../../../src/modules/delivery-review/services/review.service');

const fakeConn = { query: jest.fn() };
const tx = { commits: 0, rollbacks: 0 };
const owner = 10;
const admin = { actorType: 'OWNER_ADMIN', actorId: null };

function reviewRow(overrides = {}) {
  return {
    review_id: 7,
    customer_id: owner,
    product_id: 5,
    order_id: 100,
    rating: 4,
    review_text: 'Great shirt',
    moderation_status: 'PENDING_MODERATION',
    created_at: 'x',
    ...overrides,
  };
}

function expectNothingWritten() {
  expect(reviewRepository.create).not.toHaveBeenCalled();
  expect(reviewRepository.updateOwnReviewContent).not.toHaveBeenCalled();
  expect(reviewRepository.updateModerationStatus).not.toHaveBeenCalled();
  expect(reviewRepository.insertModerationLog).not.toHaveBeenCalled();
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
  orderService.getOrderDetail.mockResolvedValue({ orderId: 100, customerId: owner, status: 'READY_FOR_DELIVERY', items: [{ productId: 5 }] });
  deliveryRepository.findByOrderId.mockResolvedValue({ delivery_id: 1, order_id: 100, status: 'DELIVERED' });
  deliveryRepository.findByIdForUpdate.mockResolvedValue({ delivery_id: 1, order_id: 100, status: 'DELIVERED' });
  reviewRepository.findActiveForPurchase.mockResolvedValue(null);
  reviewRepository.create.mockResolvedValue(reviewRow());
  reviewRepository.updateModerationStatus.mockResolvedValue(1);
  reviewRepository.updateOwnReviewContent.mockResolvedValue(1);
  inventoryService.getProduct.mockResolvedValue({ product_id: 5, name: 'Oversized Tee' });
});

describe('review.service.submitReview() — eligibility', () => {
  const submission = { orderId: 100, productId: 5, rating: 4, reviewText: 'Great shirt' };

  it("403s when the order doesn't belong to the requesting customer", async () => {
    orderService.getOrderDetail.mockResolvedValue({ orderId: 100, customerId: 999, status: 'READY_FOR_DELIVERY', items: [{ productId: 5 }] });
    await expect(reviewService.submitReview(owner, submission)).rejects.toMatchObject({ statusCode: 403 });
    expect(withTransaction).not.toHaveBeenCalled();
    expectNothingWritten();
  });

  it('400s PRODUCT_NOT_IN_ORDER when the product was not part of the order', async () => {
    orderService.getOrderDetail.mockResolvedValue({ orderId: 100, customerId: owner, status: 'READY_FOR_DELIVERY', items: [{ productId: 999 }] });
    await expect(reviewService.submitReview(owner, submission)).rejects.toMatchObject({ statusCode: 400, code: 'PRODUCT_NOT_IN_ORDER' });
    expect(deliveryRepository.findByOrderId).not.toHaveBeenCalled();
  });

  it('409s ORDER_NOT_DELIVERED when no Delivery exists yet for the order', async () => {
    deliveryRepository.findByOrderId.mockResolvedValue(null);
    await expect(reviewService.submitReview(owner, submission)).rejects.toMatchObject({ statusCode: 409, code: 'ORDER_NOT_DELIVERED' });
    expectNothingWritten();
  });

  it('409s ORDER_NOT_DELIVERED when the Delivery exists but is not yet Delivered', async () => {
    deliveryRepository.findByOrderId.mockResolvedValue({ delivery_id: 1, status: 'OUT_FOR_DELIVERY' });
    await expect(reviewService.submitReview(owner, submission)).rejects.toMatchObject({ statusCode: 409 });
    expectNothingWritten();
  });

  it('creates the review in one transaction: locks the delivery row, checks for duplicates, inserts, logs, commits', async () => {
    const result = await reviewService.submitReview(owner, submission);

    expect(deliveryRepository.findByIdForUpdate).toHaveBeenCalledWith(1, fakeConn);
    expect(reviewRepository.findActiveForPurchase).toHaveBeenCalledWith({ customerId: owner, productId: 5, orderId: 100 }, fakeConn);
    expect(reviewRepository.create).toHaveBeenCalledWith(
      { customerId: owner, productId: 5, orderId: 100, rating: 4, reviewText: 'Great shirt' },
      fakeConn
    );
    expect(activityLogService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'REVIEW_SUBMITTED',
        originatingModule: 'C',
        actorType: null,
        actorId: null,
        contextNote: 'Submitted by Customer #10.',
      }),
      fakeConn
    );
    expect(tx).toEqual({ commits: 1, rollbacks: 0 });
    expect(result.moderationStatus).toBe('PENDING_MODERATION');
  });

  it('passes a NULL review text through unchanged', async () => {
    await reviewService.submitReview(owner, { ...submission, reviewText: null });
    expect(reviewRepository.create).toHaveBeenCalledWith(expect.objectContaining({ reviewText: null }), fakeConn);
  });
});

describe('review.service.submitReview() — one active review per customer + product + order', () => {
  const submission = { orderId: 100, productId: 5, rating: 5 };

  it.each(['PENDING_MODERATION', 'APPROVED', 'REJECTED'])(
    '21. 409s REVIEW_ALREADY_EXISTS when an active (%s) review already exists',
    async (status) => {
      reviewRepository.findActiveForPurchase.mockResolvedValue({ review_id: 7, moderation_status: status });

      await expect(reviewService.submitReview(owner, submission)).rejects.toMatchObject({
        statusCode: 409,
        code: 'REVIEW_ALREADY_EXISTS',
      });
      expectNothingWritten();
      expect(tx).toEqual({ commits: 0, rollbacks: 1 });
    }
  );

  it('22. a DELETED review does not block a new one (the active-review lookup ignores DELETED rows)', async () => {
    reviewRepository.findActiveForPurchase.mockResolvedValue(null);
    await reviewService.submitReview(owner, submission);
    expect(reviewRepository.create).toHaveBeenCalled();
  });

  it('only checks this exact product/order, so other products and orders are never blocked', async () => {
    orderService.getOrderDetail.mockResolvedValue({ orderId: 200, customerId: owner, status: 'READY_FOR_DELIVERY', items: [{ productId: 6 }] });
    await reviewService.submitReview(owner, { orderId: 200, productId: 6, rating: 4 });
    expect(reviewRepository.findActiveForPurchase).toHaveBeenCalledWith({ customerId: owner, productId: 6, orderId: 200 }, fakeConn);
  });
});

describe('review.service.submitReview() — Cancelled orders cannot be reviewed (Step 7B)', () => {
  const submission = { orderId: 100, productId: 5, rating: 4, reviewText: 'Great shirt' };

  it('35. 422s ORDER_CANCELLED for a Cancelled order even though its delivery reached Delivered', async () => {
    orderService.getOrderDetail.mockResolvedValue({ orderId: 100, customerId: owner, status: 'CANCELLED', items: [{ productId: 5 }] });
    await expect(reviewService.submitReview(owner, submission)).rejects.toMatchObject({
      statusCode: 422,
      code: 'ORDER_CANCELLED',
      message: 'You cannot review an order that has been cancelled.',
    });
    expectNothingWritten();
  });

  it("still 403s first when the Cancelled order belongs to another customer (ownership is checked before status)", async () => {
    orderService.getOrderDetail.mockResolvedValue({ orderId: 100, customerId: 999, status: 'CANCELLED', items: [{ productId: 5 }] });
    await expect(reviewService.submitReview(owner, submission)).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });
});

describe('review.service.listOwnReviews()', () => {
  it("1. returns the authenticated customer's reviews with product names and status", async () => {
    reviewRepository.findByCustomerId.mockResolvedValue({
      rows: [reviewRow({ moderation_status: 'APPROVED' }), reviewRow({ review_id: 8, product_id: 6, moderation_status: 'REJECTED' })],
      total: 2,
    });
    inventoryService.getProduct.mockImplementation(async (id) => ({ product_id: id, name: id === 5 ? 'Oversized Tee' : 'Cargo Pants' }));

    const result = await reviewService.listOwnReviews(owner, { page: 1, limit: 20 });

    expect(reviewRepository.findByCustomerId).toHaveBeenCalledWith(owner, { page: 1, limit: 20 });
    expect(result).toEqual({
      data: [
        { reviewId: 7, productId: 5, productName: 'Oversized Tee', orderId: 100, rating: 4, reviewText: 'Great shirt', status: 'APPROVED', createdAt: 'x' },
        { reviewId: 8, productId: 6, productName: 'Cargo Pants', orderId: 100, rating: 4, reviewText: 'Great shirt', status: 'REJECTED', createdAt: 'x' },
      ],
      meta: { page: 1, limit: 20, total: 2 },
    });
  });

  it('2. never includes a customerId and only ever queries the given (token) customer', async () => {
    reviewRepository.findByCustomerId.mockResolvedValue({ rows: [reviewRow()], total: 1 });
    const result = await reviewService.listOwnReviews(owner, { page: 1, limit: 20 });
    expect(result.data[0]).not.toHaveProperty('customerId');
    expect(reviewRepository.findByCustomerId).toHaveBeenCalledTimes(1);
    expect(reviewRepository.findByCustomerId.mock.calls[0][0]).toBe(owner);
  });

  it('looks each product up once and shows null when a product no longer exists', async () => {
    reviewRepository.findByCustomerId.mockResolvedValue({ rows: [reviewRow(), reviewRow({ review_id: 8 })], total: 2 });
    inventoryService.getProduct.mockRejectedValue(ApiError.notFound('PRODUCT_NOT_FOUND', 'gone'));
    const result = await reviewService.listOwnReviews(owner, { page: 1, limit: 20 });
    expect(inventoryService.getProduct).toHaveBeenCalledTimes(1);
    expect(result.data.map((r) => r.productName)).toEqual([null, null]);
  });
});

describe('review.service.updateOwnReview()', () => {
  it.each(['PENDING_MODERATION', 'APPROVED', 'REJECTED'])(
    '3-7. edits an own %s review on the locked row and sends it back to PENDING_MODERATION',
    async (status) => {
      reviewRepository.findByIdForUpdate.mockResolvedValue(reviewRow({ moderation_status: status }));
      reviewRepository.findById.mockResolvedValue(reviewRow({ rating: 5, review_text: 'Even better', moderation_status: 'PENDING_MODERATION' }));

      const result = await reviewService.updateOwnReview(owner, 7, { rating: 5, reviewText: 'Even better' });

      expect(reviewRepository.findByIdForUpdate).toHaveBeenCalledWith(7, fakeConn);
      expect(reviewRepository.updateOwnReviewContent).toHaveBeenCalledWith(
        { reviewId: 7, customerId: owner, rating: 5, reviewText: 'Even better', expectedStatus: status },
        fakeConn
      );
      expect(activityLogService.logActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'REVIEW_EDITED',
          affectedEntityType: 'Review',
          affectedEntityId: 7,
          actorType: null,
          actorId: null,
          contextNote: `Edited by Customer #10; ${status} -> PENDING_MODERATION.`,
        }),
        fakeConn
      );
      expect(tx).toEqual({ commits: 1, rollbacks: 0 });
      expect(result).toMatchObject({ reviewId: 7, status: 'PENDING_MODERATION', rating: 5, reviewText: 'Even better', productName: 'Oversized Tee' });
      expect(result).not.toHaveProperty('customerId');
    }
  );

  it('keeps the other field when only one is changed, and a null text clears it', async () => {
    reviewRepository.findByIdForUpdate.mockResolvedValue(reviewRow({ rating: 2, review_text: 'Old text' }));
    reviewRepository.findById.mockResolvedValue(reviewRow());

    await reviewService.updateOwnReview(owner, 7, { rating: 5 });
    expect(reviewRepository.updateOwnReviewContent).toHaveBeenLastCalledWith(expect.objectContaining({ rating: 5, reviewText: 'Old text' }), fakeConn);

    await reviewService.updateOwnReview(owner, 7, { reviewText: null });
    expect(reviewRepository.updateOwnReviewContent).toHaveBeenLastCalledWith(expect.objectContaining({ rating: 2, reviewText: null }), fakeConn);
  });

  it('8. 422s REVIEW_DELETED for a deleted review and writes nothing', async () => {
    reviewRepository.findByIdForUpdate.mockResolvedValue(reviewRow({ moderation_status: 'DELETED' }));
    await expect(reviewService.updateOwnReview(owner, 7, { rating: 5 })).rejects.toMatchObject({ statusCode: 422, code: 'REVIEW_DELETED' });
    expectNothingWritten();
    expect(tx).toEqual({ commits: 0, rollbacks: 1 });
  });

  it("11. returns the same 404 for another customer's review as for a missing one", async () => {
    reviewRepository.findByIdForUpdate.mockResolvedValueOnce(reviewRow({ customer_id: 999 })).mockResolvedValueOnce(null);
    const other = await reviewService.updateOwnReview(owner, 7, { rating: 5 }).catch((e) => e);
    const missing = await reviewService.updateOwnReview(owner, 7, { rating: 5 }).catch((e) => e);
    expect(other).toMatchObject({ statusCode: 404, code: 'REVIEW_NOT_FOUND', message: 'Review 7 does not exist.' });
    expect({ statusCode: other.statusCode, code: other.code, message: other.message }).toEqual({
      statusCode: missing.statusCode,
      code: missing.code,
      message: missing.message,
    });
    expectNothingWritten();
  });

  it('35. 422s ORDER_CANCELLED when the review belongs to a Cancelled order', async () => {
    reviewRepository.findByIdForUpdate.mockResolvedValue(reviewRow({ moderation_status: 'APPROVED' }));
    orderService.getOrderDetail.mockResolvedValue({ orderId: 100, customerId: owner, status: 'CANCELLED', items: [] });
    await expect(reviewService.updateOwnReview(owner, 7, { rating: 5 })).rejects.toMatchObject({ statusCode: 422, code: 'ORDER_CANCELLED' });
    expectNothingWritten();
  });

  it('37. reads the review under the row lock first and passes that locked status to the conditional UPDATE', async () => {
    reviewRepository.findByIdForUpdate.mockResolvedValue(reviewRow({ moderation_status: 'REJECTED' }));
    reviewRepository.findById.mockResolvedValue(reviewRow());
    await reviewService.updateOwnReview(owner, 7, { rating: 3 });
    expect(reviewRepository.findByIdForUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      reviewRepository.updateOwnReviewContent.mock.invocationCallOrder[0]
    );
    expect(reviewRepository.updateOwnReviewContent.mock.calls[0][0].expectedStatus).toBe('REJECTED');
  });

  it('409s REVIEW_CHANGED and rolls back when the conditional UPDATE affects 0 rows', async () => {
    reviewRepository.findByIdForUpdate.mockResolvedValue(reviewRow());
    reviewRepository.updateOwnReviewContent.mockResolvedValue(0);
    await expect(reviewService.updateOwnReview(owner, 7, { rating: 3 })).rejects.toMatchObject({ statusCode: 409, code: 'REVIEW_CHANGED' });
    expect(activityLogService.logActivity).not.toHaveBeenCalled();
    expect(tx).toEqual({ commits: 0, rollbacks: 1 });
  });
});

describe('review.service.deleteOwnReview()', () => {
  it.each(['PENDING_MODERATION', 'APPROVED', 'REJECTED'])('9. soft-deletes an own %s review (status DELETED, row kept)', async (status) => {
    reviewRepository.findByIdForUpdate.mockResolvedValue(reviewRow({ moderation_status: status }));

    await expect(reviewService.deleteOwnReview(owner, 7)).resolves.toEqual({ reviewId: 7, status: 'DELETED' });

    expect(reviewRepository.updateModerationStatus).toHaveBeenCalledWith(7, 'DELETED', status, fakeConn);
    expect(activityLogService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'REVIEW_DELETED_BY_CUSTOMER', affectedEntityId: 7, contextNote: `Deleted by Customer #10; was ${status}.` }),
      fakeConn
    );
    expect(reviewRepository.insertModerationLog).not.toHaveBeenCalled(); // a customer is not a moderator
    expect(tx).toEqual({ commits: 1, rollbacks: 0 });
  });

  it("10/11. 404s for another customer's review and writes nothing", async () => {
    reviewRepository.findByIdForUpdate.mockResolvedValue(reviewRow({ customer_id: 999 }));
    await expect(reviewService.deleteOwnReview(owner, 7)).rejects.toMatchObject({ statusCode: 404, code: 'REVIEW_NOT_FOUND' });
    expectNothingWritten();
  });

  it('404s for a review that does not exist', async () => {
    reviewRepository.findByIdForUpdate.mockResolvedValue(null);
    await expect(reviewService.deleteOwnReview(owner, 7)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('12. 422s REVIEW_ALREADY_DELETED for a review that is already deleted', async () => {
    reviewRepository.findByIdForUpdate.mockResolvedValue(reviewRow({ moderation_status: 'DELETED' }));
    await expect(reviewService.deleteOwnReview(owner, 7)).rejects.toMatchObject({ statusCode: 422, code: 'REVIEW_ALREADY_DELETED' });
    expectNothingWritten();
  });

  it('409s REVIEW_CHANGED and rolls back when the conditional UPDATE affects 0 rows', async () => {
    reviewRepository.findByIdForUpdate.mockResolvedValue(reviewRow());
    reviewRepository.updateModerationStatus.mockResolvedValue(0);
    await expect(reviewService.deleteOwnReview(owner, 7)).rejects.toMatchObject({ statusCode: 409, code: 'REVIEW_CHANGED' });
    expect(activityLogService.logActivity).not.toHaveBeenCalled();
    expect(tx).toEqual({ commits: 0, rollbacks: 1 });
  });
});

describe('review.service.getProductReviews() — public', () => {
  it('32/33/34. returns Approved reviews plus the average, without customerId or orderId', async () => {
    reviewRepository.findApprovedByProductId.mockResolvedValue({ rows: [reviewRow({ moderation_status: 'APPROVED' })], total: 1 });
    reviewRepository.getAverageApprovedRating.mockResolvedValue(4.5);

    const result = await reviewService.getProductReviews(5, { page: 1, limit: 20 });

    expect(reviewRepository.findApprovedByProductId).toHaveBeenCalledWith(5, { page: 1, limit: 20 });
    expect(result).toEqual({
      data: [{ reviewId: 7, productId: 5, rating: 4, reviewText: 'Great shirt', createdAt: 'x' }],
      meta: { page: 1, limit: 20, total: 1, averageRating: 4.5 },
    });
    expect(result.data[0]).not.toHaveProperty('customerId');
    expect(result.data[0]).not.toHaveProperty('orderId');
  });

  it('returns a null average when there are no Approved reviews yet', async () => {
    reviewRepository.findApprovedByProductId.mockResolvedValue({ rows: [], total: 0 });
    reviewRepository.getAverageApprovedRating.mockResolvedValue(null);
    const result = await reviewService.getProductReviews(5, { page: 1, limit: 20 });
    expect(result.meta.averageRating).toBeNull();
  });
});

describe('review.service.listModerationQueue() — admin list', () => {
  it('defaults to Pending Moderation', async () => {
    reviewRepository.findByModerationStatus.mockResolvedValue({ rows: [], total: 0 });
    const result = await reviewService.listModerationQueue({ page: 1, limit: 20 });
    expect(reviewRepository.findByModerationStatus).toHaveBeenCalledWith('PENDING_MODERATION', { page: 1, limit: 20 });
    expect(result.meta.status).toBe('PENDING_MODERATION');
  });

  it.each(['APPROVED', 'REJECTED', 'DELETED'])('lists %s reviews when filtered', async (status) => {
    reviewRepository.findByModerationStatus.mockResolvedValue({ rows: [reviewRow({ moderation_status: status })], total: 1 });
    const result = await reviewService.listModerationQueue({ page: 1, limit: 20, status });
    expect(reviewRepository.findByModerationStatus).toHaveBeenCalledWith(status, { page: 1, limit: 20 });
    expect(result.data[0].moderationStatus).toBe(status);
  });
});

describe('review.service.moderateReview() — state rules, row lock, logs', () => {
  it.each([
    ['23', 'PENDING_MODERATION', 'APPROVE', 'APPROVED'],
    ['24', 'PENDING_MODERATION', 'REJECT', 'REJECTED'],
    ['25', 'PENDING_MODERATION', 'DELETE', 'DELETED'],
    ['26', 'APPROVED', 'DELETE', 'DELETED'],
    ['27', 'REJECTED', 'APPROVE', 'APPROVED'],
    ['28', 'REJECTED', 'DELETE', 'DELETED'],
  ])('%s. %s + %s -> %s', async (_n, from, action, to) => {
    reviewRepository.findByIdForUpdate.mockResolvedValue(reviewRow({ moderation_status: from }));
    reviewRepository.findById.mockResolvedValue(reviewRow({ moderation_status: to }));

    const result = await reviewService.moderateReview(7, action, admin);

    expect(reviewRepository.findByIdForUpdate).toHaveBeenCalledWith(7, fakeConn);
    expect(reviewRepository.updateModerationStatus).toHaveBeenCalledWith(7, to, from, fakeConn);
    expect(reviewRepository.insertModerationLog).toHaveBeenCalledWith(
      { reviewId: 7, actorType: 'OWNER_ADMIN', actorId: null, action },
      fakeConn
    );
    expect(activityLogService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: 'OWNER_ADMIN', actorId: null, actionType: `REVIEW_${to}`, affectedEntityId: 7 }),
      fakeConn
    );
    expect(tx).toEqual({ commits: 1, rollbacks: 0 });
    expect(result.moderationStatus).toBe(to);
  });

  it.each([
    ['29', 'DELETED', 'APPROVE', 'Review 7 is deleted and cannot be approved.'],
    ['30', 'DELETED', 'REJECT', 'Review 7 is deleted and cannot be rejected.'],
    ['31', 'DELETED', 'DELETE', 'Review 7 is deleted and cannot be deleted.'],
    ['-', 'APPROVED', 'APPROVE', 'Review 7 is approved and cannot be approved.'],
    ['-', 'APPROVED', 'REJECT', 'Review 7 is approved and cannot be rejected.'],
    ['-', 'REJECTED', 'REJECT', 'Review 7 is rejected and cannot be rejected.'],
  ])('%s. refuses %s + %s with 422 INVALID_MODERATION_ACTION and writes nothing', async (_n, from, action, message) => {
    reviewRepository.findByIdForUpdate.mockResolvedValue(reviewRow({ moderation_status: from }));

    await expect(reviewService.moderateReview(7, action, admin)).rejects.toMatchObject({
      statusCode: 422,
      code: 'INVALID_MODERATION_ACTION',
      message,
    });
    expectNothingWritten();
    expect(tx).toEqual({ commits: 0, rollbacks: 1 });
  });

  it('404s REVIEW_NOT_FOUND when the review does not exist', async () => {
    reviewRepository.findByIdForUpdate.mockResolvedValue(null);
    await expect(reviewService.moderateReview(999, 'APPROVE', admin)).rejects.toMatchObject({ statusCode: 404, code: 'REVIEW_NOT_FOUND' });
    expectNothingWritten();
  });

  it('Staff: records actor_type = STAFF_ADMIN_USER with the real staff_admin_user_id', async () => {
    reviewRepository.findByIdForUpdate.mockResolvedValue(reviewRow());
    reviewRepository.findById.mockResolvedValue(reviewRow({ moderation_status: 'REJECTED' }));
    await reviewService.moderateReview(7, 'REJECT', { actorType: 'STAFF_ADMIN_USER', actorId: 42 });
    expect(reviewRepository.insertModerationLog).toHaveBeenCalledWith(
      { reviewId: 7, actorType: 'STAFF_ADMIN_USER', actorId: 42, action: 'REJECT' },
      fakeConn
    );
  });

  it('409s REVIEW_CHANGED and rolls back when the conditional UPDATE affects 0 rows', async () => {
    reviewRepository.findByIdForUpdate.mockResolvedValue(reviewRow());
    reviewRepository.updateModerationStatus.mockResolvedValue(0);
    await expect(reviewService.moderateReview(7, 'APPROVE', admin)).rejects.toMatchObject({ statusCode: 409, code: 'REVIEW_CHANGED' });
    expect(reviewRepository.insertModerationLog).not.toHaveBeenCalled();
    expect(activityLogService.logActivity).not.toHaveBeenCalled();
    expect(tx).toEqual({ commits: 0, rollbacks: 1 });
  });
});
