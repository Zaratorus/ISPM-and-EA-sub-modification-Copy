/**
 * order.repository.js
 * Direct data access for `orders`, `order_items`, and `order_status_history`
 * only. Module B owns all three exclusively (Physical MySQL Database
 * Schema Design V1.0, Section 3). Never touches `products` or
 * `inventory_stock` — those belong to Module A (see inventory.service.js).
 */

const { pool } = require('../../../shared/db/connection');

const ORDER_BASE_SELECT = `
  SELECT order_id, customer_id, delivery_address, whatsapp_checkout_reference, status, created_at, updated_at
    FROM orders
`;

/**
 * `deliveryAddress` is captured once here (project-owner amendment
 * resolving the EP-03 delivery-address schema gap) and is the sole
 * authoritative source Delivery later snapshots from at handover — see
 * delivery.repository.js in the delivery-review module.
 */
async function createOrder({ customerId, deliveryAddress, whatsappCheckoutReference }, conn) {
  const [result] = await conn.query(
    'INSERT INTO orders (customer_id, delivery_address, whatsapp_checkout_reference, status) VALUES (?, ?, ?, "PENDING")',
    [customerId, deliveryAddress, whatsappCheckoutReference ?? null]
  );
  return result.insertId;
}

async function addOrderItem({ orderId, productId, quantity, priceSnapshot }, conn) {
  await conn.query(
    'INSERT INTO order_items (order_id, product_id, quantity, price_snapshot) VALUES (?, ?, ?, ?)',
    [orderId, productId, quantity, priceSnapshot]
  );
}

async function findById(orderId, conn = pool) {
  const [rows] = await conn.query(`${ORDER_BASE_SELECT} WHERE order_id = ?`, [orderId]);
  return rows[0] || null;
}

async function findItemsByOrderId(orderId, conn = pool) {
  const [rows] = await conn.query(
    'SELECT order_item_id, order_id, product_id, quantity, price_snapshot FROM order_items WHERE order_id = ?',
    [orderId]
  );
  return rows;
}

async function findByCustomerId(customerId, { status, page, limit }) {
  const where = ['customer_id = ?'];
  const params = [customerId];
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  const whereClause = `WHERE ${where.join(' AND ')}`;
  const offset = (page - 1) * limit;

  const [rows] = await pool.query(
    `${ORDER_BASE_SELECT} ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM orders ${whereClause}`, params);
  return { rows, total: countRows[0].total };
}

async function findAll({ status, page, limit }) {
  const where = [];
  const params = [];
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const [rows] = await pool.query(
    `${ORDER_BASE_SELECT} ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM orders ${whereClause}`, params);
  return { rows, total: countRows[0].total };
}

async function updateStatus(orderId, status, conn) {
  await conn.query('UPDATE orders SET status = ? WHERE order_id = ?', [status, orderId]);
}

// order_status_history.actor_type only supports these three values — unlike
// activity_log's ENUM, it has NO 'OWNER_ADMIN' value.
const VALID_ORDER_HISTORY_ACTOR_TYPES = new Set(['STAFF_ADMIN_USER', 'CUSTOMER', 'SYSTEM']);

/**
 * `actor_type`/`actor_id` are NULLable (schema comment: "OPEN item 5" — the
 * cancellation-actor question). Owner/Admin-triggered transitions (via the
 * Access Key, not a Staff/Admin User row) don't fit this ENUM's three
 * values, so they are stored as NULL/NULL here rather than forcing a value
 * the column doesn't support — left null exactly where the schema itself
 * leaves room for it, not stretched to fit. (activity_log, which DOES have
 * an 'OWNER_ADMIN' value, is the authoritative record of who performed the
 * action either way — see activity-log.service.js.)
 */
async function addStatusHistory({ orderId, fromStatus, toStatus, actorType, actorId }, conn) {
  const safeActorType = VALID_ORDER_HISTORY_ACTOR_TYPES.has(actorType) ? actorType : null;
  const safeActorId = safeActorType ? actorId ?? null : null;
  await conn.query(
    'INSERT INTO order_status_history (order_id, from_status, to_status, actor_type, actor_id) VALUES (?, ?, ?, ?, ?)',
    [orderId, fromStatus, toStatus, safeActorType, safeActorId]
  );
}

module.exports = {
  createOrder,
  addOrderItem,
  findById,
  findItemsByOrderId,
  findByCustomerId,
  findAll,
  updateStatus,
  addStatusHistory,
};
