/**
 * dashboard.service.js
 * Owning module: D (EP-04). GET /dashboard — "Unified operational summary
 * (reads across A/B/C)" (Backend/API Architecture Design V1.0, Section
 * 6). Read-only aggregation ONLY — this file must never re-implement or
 * duplicate another module's business logic (System Architecture V1.2,
 * Section 6: "Module D must not take ownership of the business logic it
 * summarises... it displays order counts but does not decide what counts
 * as 'pending'").
 *
 * Every number below is read through an ALREADY-EXPOSED service function
 * of the owning module — never a direct read of another module's
 * repository/table (Backend/API Architecture Design V1.0, Section 13).
 * No new cross-module read function was added to any other module for
 * this dashboard; each total is obtained via `meta.total` on an existing
 * paginated list call (page 1, limit 1) rather than inventing a dedicated
 * count endpoint elsewhere.
 *
 * Module C currently exposes no list-all/count interface for Delivery, so
 * that figure is disclosed as unavailable below rather than worked around.
 */

const productService = require('../../product-catalogue/services/product.service');
const orderService = require('../../customer-order/services/order.service');
const reviewService = require('../../delivery-review/services/review.service');

const { ORDER_STATUS } = require('../../../shared/constants/statuses');

async function countTotal(listFn, extraArgs = {}) {
  const { meta } = await listFn({ ...extraArgs, page: 1, limit: 1 });
  return meta.total;
}

async function getDashboard() {
  const [totalActiveProducts, orderCountsByStatus, pendingReviews] = await Promise.all([
    countTotal(productService.searchProducts),
    getOrderCountsByStatus(),
    countTotal(reviewService.listModerationQueue),
  ]);

  return {
    productCatalogue: {
      totalActiveProducts,
    },
    orders: orderCountsByStatus,
    reviews: {
      pendingModeration: pendingReviews,
    },
    delivery: {
      note: 'Not available — Module C exposes no list-all/count interface for Delivery yet.',
    },
  };
}

async function getOrderCountsByStatus() {
  const statuses = Object.values(ORDER_STATUS);
  const counts = await Promise.all(statuses.map((status) => countTotal(orderService.listAllOrders, { status })));
  const byStatus = Object.fromEntries(statuses.map((status, i) => [status, counts[i]]));
  const total = counts.reduce((sum, c) => sum + c, 0);
  return { total, byStatus };
}

module.exports = { getDashboard };
