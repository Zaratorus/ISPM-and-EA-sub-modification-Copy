const { z } = require('zod');
const { REVIEW_MODERATION_STATUS } = require('../../../shared/constants/statuses');

// ------------------------------------------------------- shared field rules
// Rating must be a real JSON integer 1-5. No coercion: true/false, "5", 4.5
// and null are all rejected rather than silently converted.
const RATING_MESSAGE = 'Rating must be a whole number from 1 to 5.';
const ratingSchema = z
  .number({ required_error: 'Rating is required.', invalid_type_error: RATING_MESSAGE })
  .int(RATING_MESSAGE)
  .min(1, RATING_MESSAGE)
  .max(5, RATING_MESSAGE);

// Trimmed, at most 2000 characters. Empty/whitespace-only text (or null) is
// stored as NULL, never as an empty string. No minimum length.
const reviewTextSchema = z
  .string({ invalid_type_error: 'Review text must be text.' })
  .trim()
  .max(2000, 'Review text must be at most 2000 characters.')
  .nullable()
  .transform((value) => (value === null || value === '' ? null : value));

const reviewIdParams = z.object({ id: z.coerce.number().int().positive() });
const paging = {
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
};

// POST /reviews — orderId identifies which purchase is being reviewed;
// productId identifies which item within that order (Review has both as
// required FKs — Logical Database Design V1.1, Section C3).
const submitReviewSchema = {
  body: z.object({
    orderId: z.coerce.number().int().positive(),
    productId: z.coerce.number().int().positive(),
    rating: ratingSchema,
    reviewText: reviewTextSchema.optional(),
  }),
};

// GET /reviews/mine — Customer (own reviews only; identity comes from the token).
const myReviewsQuerySchema = {
  query: z.object(paging),
};

// PATCH /reviews/:id — Customer edits their own review. Only rating and
// reviewText may be sent (strict: any other field, e.g. moderationStatus or
// customerId, is rejected) and at least one of them is required.
const updateReviewSchema = {
  params: reviewIdParams,
  body: z
    .object({
      rating: ratingSchema.optional(),
      reviewText: reviewTextSchema.optional(),
    })
    .strict()
    .refine((body) => body.rating !== undefined || body.reviewText !== undefined, {
      message: 'Provide a rating and/or reviewText to update.',
    }),
};

// DELETE /reviews/:id — Customer soft-deletes their own review.
const reviewIdParamSchema = {
  params: reviewIdParams,
};

// GET /products/:id/reviews — Public
const productReviewsSchema = {
  params: z.object({ id: z.coerce.number().int().positive() }),
  query: z.object(paging),
};

// GET /reviews — Admin moderation list, filterable by moderation status.
// Defaults to PENDING_MODERATION (the original moderation queue).
const moderationQueueQuerySchema = {
  query: z.object({
    ...paging,
    status: z
      .enum(Object.values(REVIEW_MODERATION_STATUS))
      .default(REVIEW_MODERATION_STATUS.PENDING_MODERATION),
  }),
};

// PATCH /reviews/:id/moderate — Admin. Action set is exactly
// moderation_logs.action's ENUM (Physical Schema V1.0) — Approve / Reject /
// Delete, per System Architecture V1.2 Section 12. No other action exists.
const moderateReviewSchema = {
  params: reviewIdParams,
  body: z.object({ action: z.enum(['APPROVE', 'REJECT', 'DELETE']) }),
};

module.exports = {
  submitReviewSchema,
  myReviewsQuerySchema,
  updateReviewSchema,
  reviewIdParamSchema,
  productReviewsSchema,
  moderationQueueQuerySchema,
  moderateReviewSchema,
};
