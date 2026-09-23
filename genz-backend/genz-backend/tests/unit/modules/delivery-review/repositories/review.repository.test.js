/**
 * review.repository.test.js
 * The SQL behind review self-service and moderation: the row lock, the
 * status-conditional updates (returning affected rows), the duplicate and
 * own-review lookups that ignore DELETED reviews, and the approved-only
 * public query.
 */

jest.mock('../../../../../src/shared/db/connection', () => ({
  pool: { query: jest.fn() },
}));

const { pool } = require('../../../../../src/shared/db/connection');
const reviewRepository = require('../../../../../src/modules/delivery-review/repositories/review.repository');

const conn = { query: jest.fn() };
const row = { review_id: 7, customer_id: 10, product_id: 5, order_id: 100, rating: 4, review_text: 'x', moderation_status: 'APPROVED' };

beforeEach(() => jest.clearAllMocks());

describe('findByIdForUpdate()', () => {
  it('locks the review row with SELECT ... FOR UPDATE on the transaction connection', async () => {
    conn.query.mockResolvedValue([[row]]);
    await expect(reviewRepository.findByIdForUpdate(7, conn)).resolves.toBe(row);
    const [sql, params] = conn.query.mock.calls[0];
    expect(sql).toMatch(/FROM reviews WHERE review_id = \? FOR UPDATE$/);
    expect(sql).toContain('moderation_status');
    expect(params).toEqual([7]);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('returns null when the review does not exist', async () => {
    conn.query.mockResolvedValue([[]]);
    await expect(reviewRepository.findByIdForUpdate(99, conn)).resolves.toBeNull();
  });
});

describe('updateModerationStatus()', () => {
  it('only updates while the row still has the expected status, and returns affected rows', async () => {
    conn.query.mockResolvedValue([{ affectedRows: 1 }]);
    await expect(reviewRepository.updateModerationStatus(7, 'DELETED', 'APPROVED', conn)).resolves.toBe(1);
    expect(conn.query).toHaveBeenCalledWith(
      'UPDATE reviews SET moderation_status = ? WHERE review_id = ? AND moderation_status = ?',
      ['DELETED', 7, 'APPROVED']
    );
  });

  it('returns 0 when the status had changed', async () => {
    conn.query.mockResolvedValue([{ affectedRows: 0 }]);
    await expect(reviewRepository.updateModerationStatus(7, 'APPROVED', 'PENDING_MODERATION', conn)).resolves.toBe(0);
  });
});

describe('updateOwnReviewContent()', () => {
  it('sets rating/text and PENDING_MODERATION, only for the owner and the locked status', async () => {
    conn.query.mockResolvedValue([{ affectedRows: 1 }]);
    await expect(
      reviewRepository.updateOwnReviewContent({ reviewId: 7, customerId: 10, rating: 3, reviewText: undefined, expectedStatus: 'APPROVED' }, conn)
    ).resolves.toBe(1);
    const [sql, params] = conn.query.mock.calls[0];
    expect(sql).toMatch(/SET rating = \?, review_text = \?, moderation_status = 'PENDING_MODERATION'/);
    expect(sql).toMatch(/WHERE review_id = \? AND customer_id = \? AND moderation_status = \?/);
    expect(params).toEqual([3, null, 7, 10, 'APPROVED']);
  });
});

describe('findActiveForPurchase()', () => {
  it('looks only at this customer + product + order and ignores DELETED reviews', async () => {
    conn.query.mockResolvedValue([[{ review_id: 7, moderation_status: 'REJECTED' }]]);
    await expect(reviewRepository.findActiveForPurchase({ customerId: 10, productId: 5, orderId: 100 }, conn)).resolves.toEqual({
      review_id: 7,
      moderation_status: 'REJECTED',
    });
    const [sql, params] = conn.query.mock.calls[0];
    expect(sql).toMatch(/customer_id = \? AND product_id = \? AND order_id = \? AND moderation_status <> 'DELETED'/);
    expect(params).toEqual([10, 5, 100]);
  });

  it('returns null when there is no active review', async () => {
    conn.query.mockResolvedValue([[]]);
    await expect(reviewRepository.findActiveForPurchase({ customerId: 10, productId: 5, orderId: 100 }, conn)).resolves.toBeNull();
  });
});

describe('findByCustomerId()', () => {
  it("returns only the given customer's reviews, excluding DELETED ones", async () => {
    pool.query.mockResolvedValueOnce([[row]]).mockResolvedValueOnce([[{ total: 1 }]]);
    await expect(reviewRepository.findByCustomerId(10, { page: 1, limit: 20 })).resolves.toEqual({ rows: [row], total: 1 });
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/WHERE customer_id = \? AND moderation_status <> 'DELETED'/);
    expect(params).toEqual([10, 20, 0]);
    expect(pool.query.mock.calls[1][1]).toEqual([10]);
  });
});

describe('findApprovedByProductId()', () => {
  it('32. the public query returns APPROVED reviews only', async () => {
    pool.query.mockResolvedValueOnce([[row]]).mockResolvedValueOnce([[{ total: 1 }]]);
    await reviewRepository.findApprovedByProductId(5, { page: 1, limit: 20 });
    expect(pool.query.mock.calls[0][0]).toMatch(/WHERE product_id = \? AND moderation_status = 'APPROVED'/);
  });
});

describe('create()', () => {
  it('inserts a PENDING_MODERATION review on the given transaction connection (null text stays NULL)', async () => {
    conn.query.mockResolvedValueOnce([{ insertId: 7 }]).mockResolvedValueOnce([[row]]);
    await reviewRepository.create({ customerId: 10, productId: 5, orderId: 100, rating: 4, reviewText: null }, conn);
    const [sql, params] = conn.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO reviews .+'PENDING_MODERATION'/s);
    expect(params).toEqual([10, 5, 100, 4, null]);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
