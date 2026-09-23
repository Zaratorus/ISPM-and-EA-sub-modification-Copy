/**
 * delivery.repository.test.js
 * The SQL used by the courier status update: a row-locking read inside the
 * transaction and a conditional (compare-and-set) UPDATE that reports how
 * many rows it changed.
 */

jest.mock('../../../../../src/shared/db/connection', () => ({
  pool: { query: jest.fn() },
}));

const { pool } = require('../../../../../src/shared/db/connection');
const deliveryRepository = require('../../../../../src/modules/delivery-review/repositories/delivery.repository');

const conn = { query: jest.fn() };

beforeEach(() => jest.clearAllMocks());

describe('findByIdForUpdate()', () => {
  it('locks the row with SELECT ... FOR UPDATE on the given transaction connection', async () => {
    const row = { delivery_id: 1, order_id: 3, status: 'PICKED_UP' };
    conn.query.mockResolvedValue([[row]]);

    await expect(deliveryRepository.findByIdForUpdate(1, conn)).resolves.toBe(row);

    const [sql, params] = conn.query.mock.calls[0];
    expect(sql).toMatch(/^SELECT .+ FROM deliveries WHERE delivery_id = \? FOR UPDATE$/);
    expect(sql).toContain('order_id');
    expect(sql).toContain('status');
    expect(params).toEqual([1]);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('returns null when the delivery does not exist', async () => {
    conn.query.mockResolvedValue([[]]);
    await expect(deliveryRepository.findByIdForUpdate(99, conn)).resolves.toBeNull();
  });
});

describe('updateStatus()', () => {
  it('only updates while the row still has the expected old status', async () => {
    conn.query.mockResolvedValue([{ affectedRows: 1 }]);

    await deliveryRepository.updateStatus(1, 'OUT_FOR_DELIVERY', 'PICKED_UP', conn);

    expect(conn.query).toHaveBeenCalledWith('UPDATE deliveries SET status = ? WHERE delivery_id = ? AND status = ?', [
      'OUT_FOR_DELIVERY',
      1,
      'PICKED_UP',
    ]);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it.each([
    [1, 1],
    [0, 0],
  ])('returns the affected-row count (%i)', async (affectedRows, expected) => {
    conn.query.mockResolvedValue([{ affectedRows }]);
    await expect(deliveryRepository.updateStatus(1, 'OUT_FOR_DELIVERY', 'PICKED_UP', conn)).resolves.toBe(expected);
  });
});
