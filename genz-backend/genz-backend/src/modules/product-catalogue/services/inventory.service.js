/**
 * inventory.service.js
 *
 * ============================================================
 * THE SOLE EXPOSED INTERFACE FOR STOCK OPERATIONS.
 * ============================================================
 * This module implements the conceptual `decreaseStock` / `increaseStock` /
 * `getAvailability` / `getProduct` interface first defined in Detailed
 * System Architecture V1.2 (Section 2.3) and carried through every
 * subsequent document. It is imported directly by:
 *   - Module B's order.service.js (order confirmation, cancellation,
 *     checkout price snapshot/advisory availability)
 *   - Module B's cart.service.js (product existence check)
 *
 * NO OTHER FILE IN THIS CODEBASE may import inventory.repository.js
 * directly, and no other module may write to `inventory_stock` or
 * `products` under any circumstance (Physical Schema Design V1.0, Section 3).
 *
 * Transactional contract: decreaseStock/increaseStock REQUIRE a `conn`
 * (an active transaction connection obtained via withTransaction — see
 * src/shared/db/connection.js) so the stock mutation participates in the
 * SAME transaction as the caller's other writes (e.g. updating the Order's
 * status). This is what implements the atomicity rule from Physical
 * Schema Design V1.0 Section 5 / Backend/API Architecture Design V1.0
 * Section 12: "if stock decrease fails, the order remains Pending and
 * stock is unchanged" — a rollback of the whole transaction, not a
 * partial write.
 */

const inventoryRepository = require('../repositories/inventory.repository');
const productRepository = require('../repositories/product.repository');
const ApiError = require('../../../shared/utils/ApiError');

/**
 * Authoritative stock decrease. Throws ApiError.conflict if insufficient
 * stock is available AT THE MOMENT OF MUTATION — any prior availability
 * check by the caller (e.g. an admin "verify stock" step) is advisory only
 * (Detailed System Architecture V1.2, Section 9.1). This is the only place
 * in the codebase that rule is enforced.
 *
 * @param {number} productId
 * @param {number} quantity - must be > 0
 * @param {import('mysql2/promise').PoolConnection} conn - REQUIRED transaction connection
 */
async function decreaseStock(productId, quantity, conn) {
  if (!conn) {
    throw new Error('inventory.service.decreaseStock() requires a transaction connection (conn).');
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw ApiError.badRequest('INVALID_QUANTITY', 'Quantity to decrease must be a positive integer.');
  }

  const row = await inventoryRepository.getForUpdate(productId, conn);
  if (!row) {
    throw ApiError.notFound('PRODUCT_NOT_FOUND', `No inventory record for product ${productId}.`);
  }
  if (row.quantity < quantity) {
    throw ApiError.conflict(
      'INSUFFICIENT_STOCK',
      `Insufficient stock for product ${productId}: requested ${quantity}, available ${row.quantity}.`
    );
  }

  await inventoryRepository.setQuantity(productId, row.quantity - quantity, conn);
}

/**
 * Authoritative stock increase — used for order-cancellation restoration
 * (Module B: a Confirmed-or-later order being cancelled). Routine
 * restocking is Module A's own manual stock adjustment (revised DEC-05 —
 * see product.service.js.adjustStockManually()).
 *
 * @param {number} productId
 * @param {number} quantity - must be > 0
 * @param {import('mysql2/promise').PoolConnection} conn - REQUIRED transaction connection
 */
async function increaseStock(productId, quantity, conn) {
  if (!conn) {
    throw new Error('inventory.service.increaseStock() requires a transaction connection (conn).');
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw ApiError.badRequest('INVALID_QUANTITY', 'Quantity to increase must be a positive integer.');
  }

  const row = await inventoryRepository.getForUpdate(productId, conn);
  if (!row) {
    throw ApiError.notFound('PRODUCT_NOT_FOUND', `No inventory record for product ${productId}.`);
  }

  await inventoryRepository.setQuantity(productId, row.quantity + quantity, conn);
}

/**
 * Read-only availability check. NOT authoritative for a subsequent
 * decreaseStock call — it is advisory/preparatory only, per Detailed
 * System Architecture V1.2 Section 9.1. Safe to call without a transaction.
 */
async function getAvailability(productId) {
  const row = await inventoryRepository.getByProductId(productId);
  if (!row) {
    throw ApiError.notFound('PRODUCT_NOT_FOUND', `No inventory record for product ${productId}.`);
  }
  return { productId, quantity: row.quantity, availabilityStatus: row.availability_status };
}

/**
 * Read-only product reference lookup, exposed for other modules that need
 * to confirm a product exists / read its basic fields (e.g. cart item
 * validation, Order Item price snapshot at creation) without ever writing to it.
 */
async function getProduct(productId) {
  const product = await productRepository.findByIdIncludingDiscontinued(productId);
  if (!product) {
    throw ApiError.notFound('PRODUCT_NOT_FOUND', `Product ${productId} does not exist.`);
  }
  return product;
}

module.exports = { decreaseStock, increaseStock, getAvailability, getProduct };
