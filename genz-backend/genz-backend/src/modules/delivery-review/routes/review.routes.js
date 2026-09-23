const express = require('express');
const controller = require('../controllers/review.controller');
const validate = require('../../../shared/middleware/request-validator.middleware');
const { authCustomer } = require('../../../shared/middleware/auth-customer.middleware');
const authAdminAccessKey = require('../../../shared/middleware/auth-admin-access-key.middleware');
const { requirePermission } = require('../../../shared/middleware/rbac.middleware');
const {
  submitReviewSchema,
  myReviewsQuerySchema,
  updateReviewSchema,
  reviewIdParamSchema,
  moderationQueueQuerySchema,
  moderateReviewSchema,
} = require('../validators/review.validator');

const router = express.Router();

// POST /reviews — Customer — US-17
router.post('/', authCustomer, validate(submitReviewSchema), controller.submitReview);

// GET /reviews/mine — Customer — the authenticated customer's own reviews
router.get('/mine', authCustomer, validate(myReviewsQuerySchema), controller.listMyReviews);

// GET /reviews — Admin — moderation list, filterable by ?status= (default
// Pending Moderation, the original queue) — US-19
router.get(
  '/',
  authAdminAccessKey,
  requirePermission('REVIEW_MODERATE'),
  validate(moderationQueueQuerySchema),
  controller.listModerationQueue
);

// PATCH /reviews/:id/moderate — Admin — Approve / Reject / Delete — US-19
// Actor Identity Decision (Physical Schema V1.0, Section 5b): moderation_logs
// records actor_type/actor_id — Owner/Admin -> actor_id NULL, Staff -> real
// staff_admin_user_id. Staff sessions cannot yet reach this route (auth-staff
// .middleware.js is OPEN/unimplemented); only authAdminAccessKey is wired,
// consistent with every other Admin route in this codebase today.
router.patch(
  '/:id/moderate',
  authAdminAccessKey,
  requirePermission('REVIEW_MODERATE'),
  validate(moderateReviewSchema),
  controller.moderateReview
);

// PATCH /reviews/:id — Customer edits their own review (rating/reviewText only)
router.patch('/:id', authCustomer, validate(updateReviewSchema), controller.updateMyReview);

// DELETE /reviews/:id — Customer soft-deletes their own review
router.delete('/:id', authCustomer, validate(reviewIdParamSchema), controller.deleteMyReview);

module.exports = router;
