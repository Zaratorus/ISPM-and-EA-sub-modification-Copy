const reviewService = require('../services/review.service');
const asyncHandler = require('../../../shared/utils/asyncHandler');
const actorFromRequest = require('../../../shared/utils/actor-from-request');

// The acting customer always comes from the verified customer JWT
// (req.customer.customerId), never from the request body, query or path.

// POST /reviews — Customer
const submitReview = asyncHandler(async (req, res) => {
  const data = await reviewService.submitReview(req.customer.customerId, req.body);
  res.status(201).json({ data });
});

// GET /reviews/mine — Customer (own reviews)
const listMyReviews = asyncHandler(async (req, res) => {
  const data = await reviewService.listOwnReviews(req.customer.customerId, req.query);
  res.status(200).json(data);
});

// PATCH /reviews/:id — Customer (own review; rating and/or reviewText)
const updateMyReview = asyncHandler(async (req, res) => {
  const data = await reviewService.updateOwnReview(req.customer.customerId, req.params.id, req.body);
  res.status(200).json({ data });
});

// DELETE /reviews/:id — Customer (own review; soft delete)
const deleteMyReview = asyncHandler(async (req, res) => {
  const data = await reviewService.deleteOwnReview(req.customer.customerId, req.params.id);
  res.status(200).json({ data });
});

// GET /products/:id/reviews — Public
const getProductReviews = asyncHandler(async (req, res) => {
  const data = await reviewService.getProductReviews(req.params.id, req.query);
  res.status(200).json(data);
});

// GET /reviews — Admin (moderation list, filterable by status)
const listModerationQueue = asyncHandler(async (req, res) => {
  const data = await reviewService.listModerationQueue(req.query);
  res.status(200).json(data);
});

// PATCH /reviews/:id/moderate — Admin (Owner/Admin or Staff, per RBAC)
const moderateReview = asyncHandler(async (req, res) => {
  const data = await reviewService.moderateReview(req.params.id, req.body.action, actorFromRequest(req));
  res.status(200).json({ data });
});

module.exports = {
  submitReview,
  listMyReviews,
  updateMyReview,
  deleteMyReview,
  getProductReviews,
  listModerationQueue,
  moderateReview,
};
