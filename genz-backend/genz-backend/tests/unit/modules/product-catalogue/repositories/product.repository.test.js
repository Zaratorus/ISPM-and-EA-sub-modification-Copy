/**
 * product.repository.test.js
 * Verifies the Phase 3A/3B audit correction: Product creation and its
 * corresponding Inventory/Stock row must be created atomically, on the
 * same transaction connection, via withTransaction() — never as two
 * separate, unwrapped pool.query() calls.
 */

jest.mock('../../../../../src/shared/db/connection', () => ({
  pool: { query: jest.fn() },
  withTransaction: jest.fn(),
}));

const { pool, withTransaction } = require('../../../../../src/shared/db/connection');
const productRepository = require('../../../../../src/modules/product-catalogue/repositories/product.repository');

describe('product.repository.create()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('inserts the Product and its Inventory/Stock row on the SAME transaction connection, then reads back via findById()', async () => {
    const fakeConn = { query: jest.fn() };
    fakeConn.query
      .mockResolvedValueOnce([{ insertId: 42 }]) // INSERT INTO products
      .mockResolvedValueOnce([{}]); // INSERT INTO inventory_stock

    withTransaction.mockImplementation((work) => work(fakeConn));
    pool.query.mockResolvedValueOnce([[{ product_id: 42, name: 'Test Product' }]]); // findById via pool, post-commit

    const result = await productRepository.create({
      categoryId: 1,
      name: 'Test Product',
      description: 'desc',
      price: 9.99,
    });

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(fakeConn.query).toHaveBeenCalledTimes(2);
    expect(fakeConn.query.mock.calls[0][0]).toMatch(/INSERT INTO products/);
    expect(fakeConn.query.mock.calls[1][0]).toMatch(/INSERT INTO inventory_stock/);
    expect(fakeConn.query.mock.calls[1][1]).toEqual([42, 0]);
    expect(result).toEqual({ product_id: 42, name: 'Test Product' });
  });

  it('never reaches findById() (never queries the pool) if the Inventory/Stock insert fails — no orphaned Product row', async () => {
    const fakeConn = { query: jest.fn() };
    fakeConn.query
      .mockResolvedValueOnce([{ insertId: 42 }]) // INSERT INTO products succeeds
      .mockRejectedValueOnce(new Error('inventory insert failed')); // INSERT INTO inventory_stock fails

    withTransaction.mockImplementation((work) => work(fakeConn));

    await expect(
      productRepository.create({ categoryId: 1, name: 'Test Product', description: null, price: 9.99 })
    ).rejects.toThrow('inventory insert failed');

    expect(pool.query).not.toHaveBeenCalled();
  });
});
