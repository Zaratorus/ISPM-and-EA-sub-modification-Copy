/**
 * delivery.repository.js
 * Direct data access for `deliveries` and `delivery_status_history` only.
 * Module C owns both tables exclusively (Physical MySQL Database Schema
 * Design V1.0, Section 3).
 *
 * `create()` inserts the `delivery_address` value it is given verbatim —
 * it is the CALLER's responsibility (delivery.service.js) to source that
 * value as a snapshot from Module B's Order (never a live Customer read).
 * This repository has no policy of its own about where the address comes
 * from.
 */

const { pool } = require('../../../shared/db/connection');

async function create({ orderId, deliveryAddress, deliveryPersonReference }) {
  const [result] = await pool.query(
    'INSERT INTO deliveries (order_id, delivery_address, delivery_person_reference, status) VALUES (?, ?, ?, "ASSIGNED")',
    [orderId, deliveryAddress, deliveryPersonReference ?? null]
  );
  return findById(result.insertId);
}

async function findById(deliveryId, conn = pool) {
  const [rows] = await conn.query(
    'SELECT delivery_id, order_id, delivery_address, delivery_person_reference, status, assigned_at FROM deliveries WHERE delivery_id = ?',
    [deliveryId]
  );
  return rows[0] || null;
}

async function findByOrderId(orderId, conn = pool) {
  const [rows] = await conn.query(
    'SELECT delivery_id, order_id, delivery_address, delivery_person_reference, status, assigned_at FROM deliveries WHERE order_id = ?',
    [orderId]
  );
  return rows[0] || null;
}

/**
 * Locks the delivery row for update within an existing transaction (same
 * pattern as inventory.repository.getForUpdate()). MUST be called with a
 * transaction connection (never the bare pool) so concurrent status updates
 * on one delivery serialize: a second caller waits here until the first
 * commits or rolls back, then reads the status it committed.
 */
async function findByIdForUpdate(deliveryId, conn) {
  const [rows] = await conn.query(
    'SELECT delivery_id, order_id, delivery_address, delivery_person_reference, status, assigned_at FROM deliveries WHERE delivery_id = ? FOR UPDATE',
    [deliveryId]
  );
  return rows[0] || null;
}

/**
 * Conditional (compare-and-set) status update: applies only while the row
 * still has `expectedStatus`. Returns the number of affected rows — 0 means
 * the status had already changed and nothing was written.
 */
async function updateStatus(deliveryId, status, expectedStatus, conn) {
  const [result] = await conn.query('UPDATE deliveries SET status = ? WHERE delivery_id = ? AND status = ?', [
    status,
    deliveryId,
    expectedStatus,
  ]);
  return result.affectedRows;
}

async function addStatusHistory({ deliveryId, fromStatus, toStatus, actorReference }, conn) {
  await conn.query(
    'INSERT INTO delivery_status_history (delivery_id, from_status, to_status, actor_reference) VALUES (?, ?, ?, ?)',
    [deliveryId, fromStatus, toStatus, actorReference ?? null]
  );
}

async function findStatusHistory(deliveryId) {
  const [rows] = await pool.query(
    'SELECT delivery_status_history_id, from_status, to_status, actor_reference, changed_at FROM delivery_status_history WHERE delivery_id = ? ORDER BY changed_at ASC',
    [deliveryId]
  );
  return rows;
}

module.exports = { create, findById, findByIdForUpdate, findByOrderId, updateStatus, addStatusHistory, findStatusHistory };
