/**
 * product-reviews.routes.js
 * GET /products/:id/reviews — Public. Deliberately placed under Module C's
 * controller but mounted at a Module-A-looking path (Backend/API
 * Architecture Design V1.0, Section 6): "This route calls Module C's
 * review.service.js directly; it does not imply Module A owns Review
 * data." This is the resolved Product+Review integration mechanism
 * (Section 15 item 4) — mounted in app.js alongside, not instead of,
 * Module A's product.routes.js at the same `/products` prefix.
 */

const express = require('express');
const controller = require('../controllers/review.controller');
const validate = require('../../../shared/middleware/request-validator.middleware');
const { productReviewsSchema } = require('../validators/review.validator');

const router = express.Router();

router.get('/:id/reviews', validate(productReviewsSchema), controller.getProductReviews);

module.exports = router;
