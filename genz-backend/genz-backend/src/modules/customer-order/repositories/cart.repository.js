/**
 * cart.repository.js
 * Direct data access for `carts` and `cart_items` only. Module B owns both
 * tables exclusively (Physical MySQL Database Schema Design V1.0, Section 3).
 *
 * Cart is customer-authenticated-only (project-owner decision on the
 * guest-cart-persistence OPEN item: "Cart only created post-login") —
 * every function here assumes a real customerId, never a guest session.
 */

const { pool } = require('../../../shared/db/connection');

async function findActiveCartByCustomerId(customerId) {
  const [rows] = await pool.query(
    "SELECT cart_id, customer_id, status, created_at FROM carts WHERE customer_id = ? AND status = 'ACTIVE' LIMIT 1",
    [customerId]
  );
  return rows[0] || null;
}

async function findCartById(cartId) {
  const [rows] = await pool.query('SELECT cart_id, customer_id, status FROM carts WHERE cart_id = ?', [cartId]);
  return rows[0] || null;
}

async function createCart(customerId) {
  const [result] = await pool.query("INSERT INTO carts (customer_id, status) VALUES (?, 'ACTIVE')", [customerId]);
  return { cart_id: result.insertId, customer_id: customerId, status: 'ACTIVE' };
}

async function findItemsByCartId(cartId) {
  const [rows] = await pool.query(
    'SELECT cart_item_id, cart_id, product_id, variant_label, quantity FROM cart_items WHERE cart_id = ? ORDER BY cart_item_id ASC',
    [cartId]
  );
  return rows;
}

async function findItemById(cartItemId) {
  const [rows] = await pool.query(
    'SELECT cart_item_id, cart_id, product_id, variant_label, quantity FROM cart_items WHERE cart_item_id = ?',
    [cartItemId]
  );
  return rows[0] || null;
}

/**
 * Upserts a line item: increments quantity if a row already exists for
 * (cartId, productId, variantLabel), else inserts a new row. One atomic
 * statement — no read-then-write race. Logical Database Design V1.1,
 * Section B3: "a Cart should not have two separate line items for the same
 * Product; quantities should accumulate on one row instead" — now scoped
 * per size/age too (different sizes of the same product are legitimately
 * different lines), enforced by cart_items' UNIQUE (cart_id, product_id,
 * variant_label) constraint. variantLabel defaults to '' for products with
 * no size/age selector, preserving the original one-row-per-product rule
 * for everything that isn't sized.
 */
async function addOrIncrementItem(cartId, productId, variantLabel, quantity) {
  await pool.query(
    `INSERT INTO cart_items (cart_id, product_id, variant_label, quantity)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
    [cartId, productId, variantLabel ?? '', quantity]
  );
}

async function updateItemQuantity(cartItemId, quantity) {
  await pool.query('UPDATE cart_items SET quantity = ? WHERE cart_item_id = ?', [quantity, cartItemId]);
}

async function deleteItem(cartItemId) {
  await pool.query('DELETE FROM cart_items WHERE cart_item_id = ?', [cartItemId]);
}

async function markConverted(cartId, conn) {
  await conn.query("UPDATE carts SET status = 'CONVERTED' WHERE cart_id = ?", [cartId]);
}

module.exports = {
  findActiveCartByCustomerId,
  findCartById,
  createCart,
  findItemsByCartId,
  findItemById,
  addOrIncrementItem,
  updateItemQuantity,
  deleteItem,
  markConverted,
};
