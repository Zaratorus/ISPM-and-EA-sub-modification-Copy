/**
 * review.routes.test.js
 * Contract-level checks: auth gating (Customer for submission and own-review
 * self-service, Admin for the moderation list and PATCH /reviews/:id/moderate),
 * request validation, that the acting customer always comes from the token,
 * and that the moderate route derives and forwards the actor per the Actor
 * Identity Decision (Physical Schema V1.0, Section 5b).
 */

jest.mock('../../../../../src/modules/delivery-review/services/review.service', () => ({
  submitReview: jest.fn().mockResolvedValue({ reviewId: 1, moderationStatus: 'PENDING_MODERATION' }),
  listOwnReviews: jest.fn().mockResolvedValue({ data: [], meta: { page: 1, limit: 20, total: 0 } }),
  updateOwnReview: jest.fn().mockResolvedValue({ reviewId: 7, status: 'PENDING_MODERATION' }),
  deleteOwnReview: jest.fn().mockResolvedValue({ reviewId: 7, status: 'DELETED' }),
  getProductReviews: jest.fn().mockResolvedValue({ data: [], meta: { page: 1, limit: 20, total: 0, averageRating: null } }),
  listModerationQueue: jest.fn().mockResolvedValue({ data: [], meta: { page: 1, limit: 20, total: 0 } }),
  moderateReview: jest.fn().mockResolvedValue({ reviewId: 1, moderationStatus: 'APPROVED' }),
}));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const config = require('../../../../../src/config/env.config');
const ApiError = require('../../../../../src/shared/utils/ApiError');
const reviewService = require('../../../../../src/modules/delivery-review/services/review.service');
const reviewRoutes = require('../../../../../src/modules/delivery-review/routes/review.routes');
const productReviewsRoutes = require('../../../../../src/modules/delivery-review/routes/product-reviews.routes');
const errorHandler = require('../../../../../src/shared/middleware/error-handler.middleware');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/reviews', reviewRoutes);
  app.use('/api/v1/products', productReviewsRoutes);
  app.use(errorHandler);
  return app;
}

function customerToken(customerId = 10) {
  return jwt.sign({ customerId }, config.customerAuth.jwtSecret, { algorithm: 'HS256', expiresIn: '1h' });
}
function adminToken() {
  return jwt.sign({ type: 'OWNER_ADMIN' }, config.adminAccessKey.sessionJwtSecret, { algorithm: 'HS256', expiresIn: '1h' });
}
const asCustomer = (req, id = 10) => req.set('Authorization', `Bearer ${customerToken(id)}`);
const asAdmin = (req) => req.set('Authorization', `Bearer ${adminToken()}`);

beforeEach(() => jest.clearAllMocks());

describe('POST /reviews — Customer only', () => {
  it('401s with no token', async () => {
    const res = await request(buildApp()).post('/api/v1/reviews').send({ orderId: 100, productId: 5, rating: 4 });
    expect(res.status).toBe(401);
    expect(reviewService.submitReview).not.toHaveBeenCalled();
  });

  it('201s with a valid Customer token and valid body', async () => {
    const res = await asCustomer(request(buildApp()).post('/api/v1/reviews')).send({ orderId: 100, productId: 5, rating: 4, reviewText: ' Nice ' });
    expect(res.status).toBe(201);
    expect(reviewService.submitReview).toHaveBeenCalledWith(10, { orderId: 100, productId: 5, rating: 4, reviewText: 'Nice' });
  });

  it('stores whitespace-only text as null', async () => {
    await asCustomer(request(buildApp()).post('/api/v1/reviews')).send({ orderId: 100, productId: 5, rating: 4, reviewText: '   ' });
    expect(reviewService.submitReview).toHaveBeenCalledWith(10, { orderId: 100, productId: 5, rating: 4, reviewText: null });
  });

  it.each([6, 0, true, 4.5, '4'])('400s the rating %j before it reaches the service', async (rating) => {
    const res = await asCustomer(request(buildApp()).post('/api/v1/reviews')).send({ orderId: 100, productId: 5, rating });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(reviewService.submitReview).not.toHaveBeenCalled();
  });

  it('passes the service’s 409 REVIEW_ALREADY_EXISTS through unchanged', async () => {
    reviewService.submitReview.mockRejectedValueOnce(ApiError.conflict('REVIEW_ALREADY_EXISTS', 'You have already reviewed this product for this order.'));
    const res = await asCustomer(request(buildApp()).post('/api/v1/reviews')).send({ orderId: 100, productId: 5, rating: 4 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REVIEW_ALREADY_EXISTS');
  });
});

describe('GET /reviews/mine — Customer only', () => {
  it('401s with no token', async () => {
    expect((await request(buildApp()).get('/api/v1/reviews/mine')).status).toBe(401);
    expect(reviewService.listOwnReviews).not.toHaveBeenCalled();
  });

  it('401s with an Admin token — an admin session is not a customer identity', async () => {
    expect((await asAdmin(request(buildApp()).get('/api/v1/reviews/mine'))).status).toBe(401);
    expect(reviewService.listOwnReviews).not.toHaveBeenCalled();
  });

  it("1/2. lists the token customer's reviews; a customerId in the query is ignored", async () => {
    const res = await asCustomer(request(buildApp()).get('/api/v1/reviews/mine?customerId=99&page=2'), 10);
    expect(res.status).toBe(200);
    expect(reviewService.listOwnReviews).toHaveBeenCalledWith(10, { page: 2, limit: 20 });
  });
});

describe('PATCH /reviews/:id — Customer edits own review', () => {
  const patch = (body, id = 7) => asCustomer(request(buildApp()).patch(`/api/v1/reviews/${id}`)).send(body);

  it('401s with no token and with an Admin token', async () => {
    expect((await request(buildApp()).patch('/api/v1/reviews/7').send({ rating: 3 })).status).toBe(401);
    expect((await asAdmin(request(buildApp()).patch('/api/v1/reviews/7')).send({ rating: 3 })).status).toBe(401);
    expect(reviewService.updateOwnReview).not.toHaveBeenCalled();
  });

  it('200s and passes the token customer, the review id and the validated fields', async () => {
    const res = await patch({ rating: 3, reviewText: '  Updated  ' });
    expect(res.status).toBe(200);
    expect(reviewService.updateOwnReview).toHaveBeenCalledWith(10, 7, { rating: 3, reviewText: 'Updated' });
    expect(res.body.data).toEqual({ reviewId: 7, status: 'PENDING_MODERATION' });
  });

  it('19. sends whitespace-only text as null', async () => {
    await patch({ reviewText: '   ' });
    expect(reviewService.updateOwnReview).toHaveBeenCalledWith(10, 7, { reviewText: null });
  });

  it.each([
    ['13. an unknown field (moderationStatus)', { rating: 3, moderationStatus: 'APPROVED' }],
    ['13. a customerId in the body', { rating: 3, customerId: 99 }],
    ['14. an empty body', {}],
    ['16. a boolean rating', { rating: true }],
    ['17. a decimal rating', { rating: 3.5 }],
    ['15. a rating of 6', { rating: 6 }],
    ['a numeric-string rating', { rating: '3' }],
    ['20. 2001 characters of text', { reviewText: 'a'.repeat(2001) }],
  ])('400s VALIDATION_ERROR for %s', async (_label, body) => {
    const res = await patch(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(reviewService.updateOwnReview).not.toHaveBeenCalled();
  });

  it('400s an invalid review id', async () => {
    expect((await patch({ rating: 3 }, 'abc')).status).toBe(400);
  });

  it("11. passes the service's 404 REVIEW_NOT_FOUND through (another customer's review)", async () => {
    reviewService.updateOwnReview.mockRejectedValueOnce(ApiError.notFound('REVIEW_NOT_FOUND', 'Review 7 does not exist.'));
    const res = await patch({ rating: 3 });
    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({ code: 'REVIEW_NOT_FOUND', message: 'Review 7 does not exist.' });
  });

  it("8. passes the service's 422 REVIEW_DELETED through", async () => {
    reviewService.updateOwnReview.mockRejectedValueOnce(ApiError.unprocessable('REVIEW_DELETED', 'This review has been deleted and can no longer be edited.'));
    const res = await patch({ rating: 3 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('REVIEW_DELETED');
  });
});

describe('DELETE /reviews/:id — Customer soft-deletes own review', () => {
  it('401s with no token and with an Admin token', async () => {
    expect((await request(buildApp()).delete('/api/v1/reviews/7')).status).toBe(401);
    expect((await asAdmin(request(buildApp()).delete('/api/v1/reviews/7'))).status).toBe(401);
    expect(reviewService.deleteOwnReview).not.toHaveBeenCalled();
  });

  it('9. 200s with the token customer and the review id', async () => {
    const res = await asCustomer(request(buildApp()).delete('/api/v1/reviews/7'), 10);
    expect(res.status).toBe(200);
    expect(reviewService.deleteOwnReview).toHaveBeenCalledWith(10, 7);
    expect(res.body.data).toEqual({ reviewId: 7, status: 'DELETED' });
  });

  it("10. passes the service's 404 through (another customer's review)", async () => {
    reviewService.deleteOwnReview.mockRejectedValueOnce(ApiError.notFound('REVIEW_NOT_FOUND', 'Review 7 does not exist.'));
    expect((await asCustomer(request(buildApp()).delete('/api/v1/reviews/7'))).status).toBe(404);
  });

  it("12. passes the service's 422 REVIEW_ALREADY_DELETED through", async () => {
    reviewService.deleteOwnReview.mockRejectedValueOnce(ApiError.unprocessable('REVIEW_ALREADY_DELETED', 'This review has already been deleted.'));
    const res = await asCustomer(request(buildApp()).delete('/api/v1/reviews/7'));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('REVIEW_ALREADY_DELETED');
  });
});

describe('GET /products/:id/reviews — Public', () => {
  it('200s with no auth required', async () => {
    const res = await request(buildApp()).get('/api/v1/products/5/reviews');
    expect(res.status).toBe(200);
    expect(reviewService.getProductReviews).toHaveBeenCalledWith(5, expect.objectContaining({ page: 1, limit: 20 }));
  });
});

describe('GET /reviews — Admin only (moderation list)', () => {
  it('401s with no token', async () => {
    expect((await request(buildApp()).get('/api/v1/reviews')).status).toBe(401);
    expect(reviewService.listModerationQueue).not.toHaveBeenCalled();
  });

  it('401s with a Customer token (not an Admin session)', async () => {
    expect((await asCustomer(request(buildApp()).get('/api/v1/reviews'))).status).toBe(401);
    expect(reviewService.listModerationQueue).not.toHaveBeenCalled();
  });

  it('200s with a valid Admin token and defaults to Pending Moderation', async () => {
    const res = await asAdmin(request(buildApp()).get('/api/v1/reviews'));
    expect(res.status).toBe(200);
    expect(reviewService.listModerationQueue).toHaveBeenCalledWith({ page: 1, limit: 20, status: 'PENDING_MODERATION' });
  });

  it.each(['APPROVED', 'REJECTED', 'DELETED'])('filters by status=%s', async (status) => {
    await asAdmin(request(buildApp()).get(`/api/v1/reviews?status=${status}`));
    expect(reviewService.listModerationQueue).toHaveBeenCalledWith({ page: 1, limit: 20, status });
  });

  it('400s an unknown status', async () => {
    expect((await asAdmin(request(buildApp()).get('/api/v1/reviews?status=ARCHIVED'))).status).toBe(400);
    expect(reviewService.listModerationQueue).not.toHaveBeenCalled();
  });
});

describe('PATCH /reviews/:id/moderate — Admin only', () => {
  it('401s with no token (unauthorized access)', async () => {
    const res = await request(buildApp()).patch('/api/v1/reviews/1/moderate').send({ action: 'APPROVE' });
    expect(res.status).toBe(401);
    expect(reviewService.moderateReview).not.toHaveBeenCalled();
  });

  it('401s with a Customer token (not an Admin session)', async () => {
    const res = await asCustomer(request(buildApp()).patch('/api/v1/reviews/1/moderate')).send({ action: 'APPROVE' });
    expect(res.status).toBe(401);
    expect(reviewService.moderateReview).not.toHaveBeenCalled();
    expect(reviewService.updateOwnReview).not.toHaveBeenCalled();
  });

  it('400s VALIDATION_ERROR for an invalid/unrecognised moderation action', async () => {
    const res = await asAdmin(request(buildApp()).patch('/api/v1/reviews/1/moderate')).send({ action: 'SUSPEND' });
    expect(res.status).toBe(400);
    expect(reviewService.moderateReview).not.toHaveBeenCalled();
  });

  it('400s when the action field is missing', async () => {
    const res = await asAdmin(request(buildApp()).patch('/api/v1/reviews/1/moderate')).send({});
    expect(res.status).toBe(400);
    expect(reviewService.moderateReview).not.toHaveBeenCalled();
  });

  it('200s with a valid Admin token and derives the OWNER_ADMIN actor (actorId: null)', async () => {
    const res = await asAdmin(request(buildApp()).patch('/api/v1/reviews/1/moderate')).send({ action: 'APPROVE' });
    expect(res.status).toBe(200);
    expect(reviewService.moderateReview).toHaveBeenCalledWith(1, 'APPROVE', { actorType: 'OWNER_ADMIN', actorId: null });
  });

  it('404s when the service reports the review does not exist', async () => {
    reviewService.moderateReview.mockRejectedValueOnce(ApiError.notFound('REVIEW_NOT_FOUND', 'Review 999 does not exist.'));
    const res = await asAdmin(request(buildApp()).patch('/api/v1/reviews/999/moderate')).send({ action: 'APPROVE' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('REVIEW_NOT_FOUND');
  });

  it("passes the service's 422 INVALID_MODERATION_ACTION through (e.g. approving a deleted review)", async () => {
    reviewService.moderateReview.mockRejectedValueOnce(
      ApiError.unprocessable('INVALID_MODERATION_ACTION', 'Review 1 is deleted and cannot be approved.')
    );
    const res = await asAdmin(request(buildApp()).patch('/api/v1/reviews/1/moderate')).send({ action: 'APPROVE' });
    expect(res.status).toBe(422);
    expect(res.body.error).toEqual({ code: 'INVALID_MODERATION_ACTION', message: 'Review 1 is deleted and cannot be approved.' });
  });
});
