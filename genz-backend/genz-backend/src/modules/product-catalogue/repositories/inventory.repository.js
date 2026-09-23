/**
 * inventory.repository.js
 * The ONLY file in the entire codebase that writes to `inventory_stock`.
 * Not exported outside Module A directly — other modules must go through
 * inventory.service.js's decreaseStock/increaseStock/getAvailability/getProduct
 * functions (Backend/API Architecture Design V1.0, Section 2 Principle 3
 * and Section 4's inventory.service.js placement).
 */

const { pool } = require('../../../shared/db/connection');

/**
 * Locks the inventory row for update within an existing transaction.
 * MUST be called with a transaction connection (never the bare pool) so
 * concurrent stock mutations on the same product serialize correctly —
 * this is what prevents two simultaneous order confirmations from both
 * reading stale stock and both succeeding when only one should.
 */
async function getForUpdate(productId, conn) {
  const [rows] = await conn.query(
    'SELECT product_id, quantity FROM inventory_stock WHERE product_id = ? FOR UPDATE',
    [productId]
  );
  return rows[0] || null;
}

async function getByProductId(productId) {
  const [rows] = await pool.query(
    'SELECT product_id, quantity, availability_status FROM inventory_stock WHERE product_id = ?',
    [productId]
  );
  return rows[0] || null;
}

async function setQuantity(productId, newQuantity, conn) {
  await conn.query('UPDATE inventory_stock SET quantity = ? WHERE product_id = ?', [newQuantity, productId]);
}

module.exports = { getForUpdate, getByProductId, setQuantity };
