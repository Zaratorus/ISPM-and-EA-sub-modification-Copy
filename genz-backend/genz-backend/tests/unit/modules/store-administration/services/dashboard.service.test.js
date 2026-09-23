/**
 * dashboard.service.test.js
 * Verifies the dashboard is a pure read-only aggregation using ONLY
 * already-exposed cross-module service functions (never a direct
 * repository/table read), and that Module C's Delivery data is disclosed
 * as unavailable rather than guessed.
 */

jest.mock('../../../../../src/modules/product-catalogue/services/product.service', () => ({
  searchProducts: jest.fn(),
}));
jest.mock('../../../../../src/modules/customer-order/services/order.service', () => ({
  listAllOrders: jest.fn(),
}));
jest.mock('../../../../../src/modules/delivery-review/services/review.service', () => ({
  listModerationQueue: jest.fn(),
}));

const productService = require('../../../../../src/modules/product-catalogue/services/product.service');
const orderService = require('../../../../../src/modules/customer-order/services/order.service');
const reviewService = require('../../../../../src/modules/delivery-review/services/review.service');
const dashboardService = require('../../../../../src/modules/store-administration/services/dashboard.service');

beforeEach(() => {
  jest.clearAllMocks();
  productService.searchProducts.mockResolvedValue({ data: [], meta: { page: 1, limit: 1, total: 42 } });
  orderService.listAllOrders.mockResolvedValue({ data: [], meta: { page: 1, limit: 1, total: 0 } });
  reviewService.listModerationQueue.mockResolvedValue({ data: [], meta: { page: 1, limit: 1, total: 3 } });
});

describe('dashboard.service.getDashboard()', () => {
  it('reads the product total via product.service.js.searchProducts() only', async () => {
    const result = await dashboardService.getDashboard();
    expect(productService.searchProducts).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 1 }));
    expect(result.productCatalogue.totalActiveProducts).toBe(42);
  });

  it('reads per-status order counts via order.service.js.listAllOrders() only, once per status', async () => {
    orderService.listAllOrders.mockImplementation(({ status }) => {
      const totals = { PENDING: 2, CONFIRMED: 1, PROCESSING: 0, READY_FOR_DELIVERY: 1, CANCELLED: 1 };
      return Promise.resolve({ data: [], meta: { page: 1, limit: 1, total: totals[status] } });
    });

    const result = await dashboardService.getDashboard();

    expect(orderService.listAllOrders).toHaveBeenCalledTimes(5);
    expect(orderService.listAllOrders).toHaveBeenCalledWith(expect.objectContaining({ status: 'PENDING' }));
    expect(result.orders.byStatus).toEqual({
      PENDING: 2,
      CONFIRMED: 1,
      PROCESSING: 0,
      READY_FOR_DELIVERY: 1,
      CANCELLED: 1,
    });
    expect(result.orders.total).toBe(5);
  });

  it('reads pending-moderation review count via review.service.js.listModerationQueue() only', async () => {
    const result = await dashboardService.getDashboard();
    expect(reviewService.listModerationQueue).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 1 }));
    expect(result.reviews.pendingModeration).toBe(3);
  });

  it('discloses Delivery counts as unavailable, rather than guessing or duplicating their logic', async () => {
    const result = await dashboardService.getDashboard();
    expect(result.delivery.note).toMatch(/not available/i);
    // Supplier & Procurement was descoped from the final four-epic system.
    expect(result).not.toHaveProperty('procurement');
  });
});
