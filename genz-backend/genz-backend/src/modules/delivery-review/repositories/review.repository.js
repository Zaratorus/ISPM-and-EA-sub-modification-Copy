/**
 * review.repository.js
 * Direct data access for `reviews` and `moderation_logs`. Module C owns
 * both tables exclusively (Physical MySQL Database Schema Design V1.0,
 * Section 3) — combined into one file, mirroring delivery.repository.js's
 * `deliveries` + `delivery_status_history` precedent for a tightly-coupled
 * parent/log pair.
 *
 * `moderation_logs.actor_type`/`actor_id` follow the Actor Identity
 * Decision (Physical Schema V1.0, Section 5b): Owner/Admin writes
 * `actor_type = 'OWNER_ADMIN'`, `actor_id = NULL`; Staff writes
 * `actor_type = 'STAFF_ADMIN_USER'`, `actor_id = <staff_admin_user_id>`.
 *
 * There is still no uniqueness constraint on (customer_id, product_id,
 * order_id); the one-active-review rule is enforced in review.service.js
 * using findActiveForPurchase(). Deletion is always a soft delete
 * (moderation_status = 'DELETED'); rows are never removed.
 */

const { pool } = require('../../../shared/db/connection');

const REVIEW_COLUMNS = 'review_id, customer_id, product_id, order_id, rating, review_text, moderation_status, created_at';

async function create({ customerId, productId, orderId, rating, reviewText }, conn = pool) {
  const [result] = await conn.query(
    `INSERT INTO reviews (customer_id, product_id, order_id, rating, review_text, moderation_status)
     VALUES (?, ?, ?, ?, ?, 'PENDING_MODERATION')`,
    [customerId, productId, orderId, rating, reviewText ?? null]
  );
  return findById(result.insertId, conn);
}

async function findById(reviewId, conn = pool) {
  const [rows] = await conn.query(`SELECT ${REVIEW_COLUMNS} FROM reviews WHERE review_id = ?`, [reviewId]);
  return rows[0] || null;
}

/**
 * Locks the review row for update within an existing transaction (same
 * pattern as inventory.repository.getForUpdate() / delivery.repository
 * .findByIdForUpdate()). MUST be called with a transaction connection so a
 * customer edit/delete and an admin moderation of the same review serialize.
 */
async function findByIdForUpdate(reviewId, conn) {
  const [rows] = await conn.query(`SELECT ${REVIEW_COLUMNS} FROM reviews WHERE review_id = ? FOR UPDATE`, [reviewId]);
  return rows[0] || null;
}

// The customer's active (not DELETED) review of this product for this order, if any.
async function findActiveForPurchase({ customerId, productId, orderId }, conn = pool) {
  const [rows] = await conn.query(
    `SELECT review_id, moderation_status FROM reviews
      WHERE customer_id = ? AND product_id = ? AND order_id = ? AND moderation_status <> 'DELETED'
      LIMIT 1`,
    [customerId, productId, orderId]
  );
  return rows[0] || null;
}

// GET /reviews/mine — the customer's own reviews, newest first; deleted ones are excluded.
async function findByCustomerId(customerId, { page, limit }) {
  const offset = (page - 1) * limit;
  const [rows] = await pool.query(
    `SELECT ${REVIEW_COLUMNS}
       FROM reviews
      WHERE customer_id = ? AND moderation_status <> 'DELETED'
      ORDER BY created_at DESC, review_id DESC
      LIMIT ? OFFSET ?`,
    [customerId, limit, offset]
  );
  const [countRows] = await pool.query(
    "SELECT COUNT(*) AS total FROM reviews WHERE customer_id = ? AND moderation_status <> 'DELETED'",
    [customerId]
  );
  return { rows, total: countRows[0].total };
}

async function findApprovedByProductId(productId, { page, limit }) {
  const offset = (page - 1) * limit;
  const [rows] = await pool.query(
    `SELECT ${REVIEW_COLUMNS}
       FROM reviews
      WHERE product_id = ? AND moderation_status = 'APPROVED'
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?`,
    [productId, limit, offset]
  );
  const [countRows] = await pool.query(
    "SELECT COUNT(*) AS total FROM reviews WHERE product_id = ? AND moderation_status = 'APPROVED'",
    [productId]
  );
  return { rows, total: countRows[0].total };
}

// Aggregate rating: average of Approved reviews only (System Architecture
// V1.2, Section 12 — "recalculated on each new approval"). Recomputed on
// read here, consistent with Physical Schema Design V1.0's decision not to
// materialize this value (Section 6: requires cross-row aggregation).
async function getAverageApprovedRating(productId) {
  const [rows] = await pool.query(
    "SELECT AVG(rating) AS average FROM reviews WHERE product_id = ? AND moderation_status = 'APPROVED'",
    [productId]
  );
  const { average } = rows[0];
  return average === null ? null : Number(average);
}

async function findByModerationStatus(moderationStatus, { page, limit }) {
  const offset = (page - 1) * limit;
  const [rows] = await pool.query(
    `SELECT ${REVIEW_COLUMNS}
       FROM reviews
      WHERE moderation_status = ?
      ORDER BY created_at ASC
      LIMIT ? OFFSET ?`,
    [moderationStatus, limit, offset]
  );
  const [countRows] = await pool.query('SELECT COUNT(*) AS total FROM reviews WHERE moderation_status = ?', [
    moderationStatus,
  ]);
  return { rows, total: countRows[0].total };
}

/**
 * Conditional status update (admin moderation and customer soft delete):
 * applies only while the row still has `expectedStatus`. Returns the number
 * of affected rows — 0 means the status had changed and nothing was written.
 */
async function updateModerationStatus(reviewId, moderationStatus, expectedStatus, conn) {
  const [result] = await conn.query(
    'UPDATE reviews SET moderation_status = ? WHERE review_id = ? AND moderation_status = ?',
    [moderationStatus, reviewId, expectedStatus]
  );
  return result.affectedRows;
}

/**
 * Customer edit: new rating/text, and back to PENDING_MODERATION so the new
 * version is moderated before it can be public again. Conditional on the
 * owner and on the status read under the row lock. Returns affected rows.
 */
async function updateOwnReviewContent({ reviewId, customerId, rating, reviewText, expectedStatus }, conn) {
  const [result] = await conn.query(
    `UPDATE reviews SET rating = ?, review_text = ?, moderation_status = 'PENDING_MODERATION'
      WHERE review_id = ? AND customer_id = ? AND moderation_status = ?`,
    [rating, reviewText ?? null, reviewId, customerId, expectedStatus]
  );
  return result.affectedRows;
}

// Append-only insert into moderation_logs — never updated/deleted.
async function insertModerationLog({ reviewId, actorType, actorId, action }, conn) {
  await conn.query(
    'INSERT INTO moderation_logs (review_id, actor_type, actor_id, action) VALUES (?, ?, ?, ?)',
    [reviewId, actorType, actorId ?? null, action]
  );
}

module.exports = {
  create,
  findById,
  findByIdForUpdate,
  findActiveForPurchase,
  findByCustomerId,
  findApprovedByProductId,
  getAverageApprovedRating,
  findByModerationStatus,
  updateModerationStatus,
  updateOwnReviewContent,
  insertModerationLog,
};
