/**
 * Module C (EP-03 — Delivery Tracking with Review Management) route index.
 *
 * IMPLEMENTED: POST /deliveries, GET /deliveries/:id, PATCH
 * /deliveries/:id/status (Admin only), GET /orders/:id/delivery,
 * POST /reviews, GET /products/:id/reviews, GET /reviews (moderation
 * queue, read-only).
 *
 * NOT IMPLEMENTED:
 *   PATCH /reviews/:id/moderate — blocked: moderation_logs.actor_id is a
 *     mandatory FK to staff_admin_users that no current actor (Owner/Admin
 *     or Staff) can satisfy. A genuine architecture inconsistency, not an
 *     OPEN decision — see the milestone report.
 *   PATCH /deliveries/:id/status (Delivery Person path) — blocked: OPEN
 *     decision, Delivery Person identity (Section 15 item 10).
 */

const deliveryRoutes = require('./delivery.routes');
const reviewRoutes = require('./review.routes');
const productReviewsRoutes = require('./product-reviews.routes');
const orderDeliveryRoutes = require('./order-delivery.routes');

module.exports = { deliveryRoutes, reviewRoutes, productReviewsRoutes, orderDeliveryRoutes };
