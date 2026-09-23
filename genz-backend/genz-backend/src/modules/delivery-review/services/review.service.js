/**
 * review.service.js
 * Owning module: C (EP-03). Review submission, customer self-service (list /
 * edit / soft-delete their own reviews), the public approved-reviews listing
 * (with aggregate rating), and admin moderation (list filtered by status +
 * Approve / Reject / Delete).
 *
 * Moderation actor handling implements the Actor Identity Decision
 * (Physical Schema V1.0, Section 5b; Logical Database Design V1.1,
 * Section C4): Owner/Admin moderates with `actor_type = 'OWNER_ADMIN'`,
 * `actor_id = NULL`; Staff moderates with `actor_type = 'STAFF_ADMIN_USER'`
 * and its real `staff_admin_user_id`. `activity_log` remains the
 * authoritative audit record for the Owner/Admin case, exactly as decided.
 * Customer edits/deletes are not moderation actions (moderation_logs has no
 * customer actor), so they are recorded in the Activity Log only.
 *
 * Moderation state rules: Pending -> Approve/Reject/Delete; Approved ->
 * Delete; Rejected -> Approve/Delete; Deleted -> nothing (a deleted review
 * stays deleted). Customer edits send a Pending/Approved/Rejected review back
 * to Pending; a deleted review cannot be edited.
 *
 * One active review per customer + product + order (service-layer rule, no
 * schema constraint): a review counts as active unless it is DELETED.
 *
 * Concurrency: customer edits/deletes and admin moderation each run in one
 * transaction on the review row locked with SELECT ... FOR UPDATE, re-check
 * ownership/status on that locked row, and use a status-conditional UPDATE,
 * so they serialize and never silently overwrite each other. A submission
 * locks the order's delivery row, so two simultaneous submissions for the
 * same purchase cannot both pass the duplicate check.
 */

const { withTransaction } = require('../../../shared/db/connection');
const ApiError = require('../../../shared/utils/ApiError');
const { REVIEW_MODERATION_STATUS, ORDER_STATUS, DELIVERY_STATUS } = require('../../../shared/constants/statuses');
const reviewRepository = require('../repositories/review.repository');
const deliveryRepository = require('../repositories/delivery.repository');
const orderService = require('../../customer-order/services/order.service');
const inventoryService = require('../../product-catalogue/services/inventory.service');
const activityLogService = require('../../store-administration/services/activity-log.service');

const { PENDING_MODERATION, APPROVED, REJECTED, DELETED } = REVIEW_MODERATION_STATUS;

// Exactly moderation_logs.action's ENUM (Physical Schema V1.0) mapped to
// its corresponding reviews.moderation_status target.
const MODERATION_ACTION_TARGET_STATUS = Object.freeze({
  APPROVE: APPROVED,
  REJECT: REJECTED,
  DELETE: DELETED,
});

// Moderation actions allowed from each current status.
const ALLOWED_MODERATION_ACTIONS = Object.freeze({
  [PENDING_MODERATION]: ['APPROVE', 'REJECT', 'DELETE'],
  [APPROVED]: ['DELETE'],
  [REJECTED]: ['APPROVE', 'DELETE'],
  [DELETED]: [],
});
const STATUS_WORD = { [PENDING_MODERATION]: 'pending', [APPROVED]: 'approved', [REJECTED]: 'rejected', [DELETED]: 'deleted' };
const ACTION_WORD = { APPROVE: 'approved', REJECT: 'rejected', DELETE: 'deleted' };

// Admin view (moderation list): includes customer/order references.
function toReviewDTO(row) {
  return {
    reviewId: row.review_id,
    customerId: row.customer_id,
    productId: row.product_id,
    orderId: row.order_id,
    rating: row.rating,
    reviewText: row.review_text,
    moderationStatus: row.moderation_status,
    createdAt: row.created_at,
  };
}

// Public view (GET /products/:id/reviews): no customer or order identifiers.
function toPublicReviewDTO(row) {
  return {
    reviewId: row.review_id,
    productId: row.product_id,
    rating: row.rating,
    reviewText: row.review_text,
    createdAt: row.created_at,
  };
}

// The customer's own view (GET /reviews/mine, edit/delete responses).
function toOwnReviewDTO(row, productName) {
  return {
    reviewId: row.review_id,
    productId: row.product_id,
    productName: productName ?? null,
    orderId: row.order_id,
    rating: row.rating,
    reviewText: row.review_text,
    status: row.moderation_status,
    createdAt: row.created_at,
  };
}

// Same response for "does not exist" and "belongs to someone else", so a
// customer cannot discover which review IDs exist.
function reviewNotFound(reviewId) {
  return ApiError.notFound('REVIEW_NOT_FOUND', `Review ${reviewId} does not exist.`);
}
function reviewChanged() {
  return ApiError.conflict('REVIEW_CHANGED', 'This review was just updated — refresh and try again.');
}
function isOwner(review, customerId) {
  return Number(review.customer_id) === Number(customerId);
}

// Product name via Module A's exposed service (never a direct products-table read).
async function productNameFor(productId) {
  try {
    const product = await inventoryService.getProduct(productId);
    return product.name ?? null;
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 404) return null;
    throw err;
  }
}

/**
 * POST /reviews — Customer.
 * Eligibility (System Architecture V1.2, Sections 11/12): the requesting
 * customer must own the order, the order must not be Cancelled, the product
 * must be one of the order's items (verified purchase) — all read via Module
 * B's exposed order.service.js.getOrderDetail() — and the order's Delivery
 * (Module C's own data) must have reached "Delivered". The customer must not
 * already have an active review of this product for this order.
 */
async function submitReview(customerId, { orderId, productId, rating, reviewText }) {
  const order = await orderService.getOrderDetail(orderId);
  if (order.customerId !== customerId) {
    throw ApiError.forbidden('FORBIDDEN', "You cannot review another customer's order.");
  }
  // A Cancelled order can never be reviewed, even if its delivery had already
  // reached Delivered before the cancellation.
  if (order.status === ORDER_STATUS.CANCELLED) {
    throw ApiError.unprocessable('ORDER_CANCELLED', 'You cannot review an order that has been cancelled.');
  }
  const purchased = order.items.some((item) => item.productId === productId);
  if (!purchased) {
    throw ApiError.badRequest('PRODUCT_NOT_IN_ORDER', 'This product was not part of the specified order.');
  }

  const delivery = await deliveryRepository.findByOrderId(orderId);
  if (!delivery || delivery.status !== DELIVERY_STATUS.DELIVERED) {
    throw ApiError.conflict(
      'ORDER_NOT_DELIVERED',
      'You can only review a product after its order has been Delivered.'
    );
  }

  const review = await withTransaction(async (conn) => {
    // Lock the order's delivery row so simultaneous submissions for the same
    // purchase serialize: the second one then sees the first one's review.
    await deliveryRepository.findByIdForUpdate(delivery.delivery_id, conn);
    const existing = await reviewRepository.findActiveForPurchase({ customerId, productId, orderId }, conn);
    if (existing) {
      throw ApiError.conflict(
        'REVIEW_ALREADY_EXISTS',
        'You have already reviewed this product for this order. Edit your existing review instead.'
      );
    }

    const created = await reviewRepository.create({ customerId, productId, orderId, rating, reviewText }, conn);

    // activity_log.actor_type only accepts STAFF_ADMIN_USER/OWNER_ADMIN/SYSTEM
    // (activity-log.service.js's VALID_ACTOR_TYPES) — same constraint as
    // order.service.js's checkout()/cancelOrder(). Left null rather than
    // mis-tagging the actor; the Review row itself carries customer_id.
    await activityLogService.logActivity(
      {
        actorType: null,
        actorId: null,
        actionType: 'REVIEW_SUBMITTED',
        affectedEntityType: 'Review',
        affectedEntityId: created.review_id,
        originatingModule: 'C',
        contextNote: `Submitted by Customer #${customerId}.`,
      },
      conn
    );
    return created;
  });

  return toReviewDTO(review);
}

/**
 * GET /reviews/mine — Customer. The authenticated customer's own reviews
 * (not DELETED), newest first, with each product's name.
 */
async function listOwnReviews(customerId, { page, limit }) {
  const { rows, total } = await reviewRepository.findByCustomerId(customerId, { page, limit });
  const productIds = [...new Set(rows.map((row) => row.product_id))];
  const names = new Map(await Promise.all(productIds.map(async (id) => [id, await productNameFor(id)])));
  return {
    data: rows.map((row) => toOwnReviewDTO(row, names.get(row.product_id))),
    meta: { page, limit, total },
  };
}

/**
 * PATCH /reviews/:id — Customer edits their own review (rating and/or text).
 * Pending/Approved/Rejected -> Pending, so the new version is moderated
 * before it can be public again. Deleted reviews cannot be edited.
 */
async function updateOwnReview(customerId, reviewId, changes) {
  await withTransaction(async (conn) => {
    const review = await reviewRepository.findByIdForUpdate(reviewId, conn);
    if (!review || !isOwner(review, customerId)) {
      throw reviewNotFound(reviewId);
    }
    if (review.moderation_status === DELETED) {
      throw ApiError.unprocessable('REVIEW_DELETED', 'This review has been deleted and can no longer be edited.');
    }
    const order = await orderService.getOrderDetail(review.order_id);
    if (order.status === ORDER_STATUS.CANCELLED) {
      throw ApiError.unprocessable('ORDER_CANCELLED', 'You cannot edit a review for an order that has been cancelled.');
    }

    const rating = changes.rating !== undefined ? changes.rating : review.rating;
    const reviewText = changes.reviewText !== undefined ? changes.reviewText : review.review_text;
    const affectedRows = await reviewRepository.updateOwnReviewContent(
      { reviewId, customerId, rating, reviewText, expectedStatus: review.moderation_status },
      conn
    );
    if (affectedRows === 0) {
      throw reviewChanged();
    }

    await activityLogService.logActivity(
      {
        actorType: null,
        actorId: null,
        actionType: 'REVIEW_EDITED',
        affectedEntityType: 'Review',
        affectedEntityId: reviewId,
        originatingModule: 'C',
        contextNote: `Edited by Customer #${customerId}; ${review.moderation_status} -> ${PENDING_MODERATION}.`,
      },
      conn
    );
  });

  const updated = await reviewRepository.findById(reviewId);
  return toOwnReviewDTO(updated, await productNameFor(updated.product_id));
}

/**
 * DELETE /reviews/:id — Customer soft-deletes their own review (status
 * DELETED; the row is never removed). Already-deleted reviews are refused.
 */
async function deleteOwnReview(customerId, reviewId) {
  await withTransaction(async (conn) => {
    const review = await reviewRepository.findByIdForUpdate(reviewId, conn);
    if (!review || !isOwner(review, customerId)) {
      throw reviewNotFound(reviewId);
    }
    if (review.moderation_status === DELETED) {
      throw ApiError.unprocessable('REVIEW_ALREADY_DELETED', 'This review has already been deleted.');
    }

    const affectedRows = await reviewRepository.updateModerationStatus(reviewId, DELETED, review.moderation_status, conn);
    if (affectedRows === 0) {
      throw reviewChanged();
    }

    await activityLogService.logActivity(
      {
        actorType: null,
        actorId: null,
        actionType: 'REVIEW_DELETED_BY_CUSTOMER',
        affectedEntityType: 'Review',
        affectedEntityId: reviewId,
        originatingModule: 'C',
        contextNote: `Deleted by Customer #${customerId}; was ${review.moderation_status}.`,
      },
      conn
    );
  });

  return { reviewId, status: DELETED };
}

/**
 * GET /products/:id/reviews — Public. Approved reviews only + aggregate
 * rating (System Architecture V1.2, Section 12: "Rating aggregation ...
 * calculated from Approved reviews only"). No customer/order identifiers.
 */
async function getProductReviews(productId, { page, limit }) {
  const { rows, total } = await reviewRepository.findApprovedByProductId(productId, { page, limit });
  const averageRating = await reviewRepository.getAverageApprovedRating(productId);
  return { data: rows.map(toPublicReviewDTO), meta: { page, limit, total, averageRating } };
}

/**
 * GET /reviews — Admin. Reviews in one moderation status (default: Pending
 * Moderation, the original moderation queue).
 */
async function listModerationQueue({ page, limit, status = PENDING_MODERATION }) {
  const { rows, total } = await reviewRepository.findByModerationStatus(status, { page, limit });
  return { data: rows.map(toReviewDTO), meta: { page, limit, total, status } };
}

/**
 * PATCH /reviews/:id/moderate — Admin (Owner/Admin or Staff, per RBAC).
 * In one transaction on the locked review row: check the action is allowed
 * from the current status, update the status (conditionally), insert the
 * moderation_logs row and write the Activity Log entry (System Architecture
 * V1.2, Section 12: "all actions logged").
 *
 * @param {number} reviewId
 * @param {'APPROVE'|'REJECT'|'DELETE'} action
 * @param {{actorType: 'OWNER_ADMIN'|'STAFF_ADMIN_USER', actorId: number|null}} actor
 */
async function moderateReview(reviewId, action, actor) {
  const targetStatus = MODERATION_ACTION_TARGET_STATUS[action];

  await withTransaction(async (conn) => {
    const review = await reviewRepository.findByIdForUpdate(reviewId, conn);
    if (!review) {
      throw reviewNotFound(reviewId);
    }
    const currentStatus = review.moderation_status;
    if (!ALLOWED_MODERATION_ACTIONS[currentStatus].includes(action)) {
      throw ApiError.unprocessable(
        'INVALID_MODERATION_ACTION',
        `Review ${reviewId} is ${STATUS_WORD[currentStatus]} and cannot be ${ACTION_WORD[action]}.`
      );
    }

    const affectedRows = await reviewRepository.updateModerationStatus(reviewId, targetStatus, currentStatus, conn);
    if (affectedRows === 0) {
      throw reviewChanged();
    }
    await reviewRepository.insertModerationLog(
      { reviewId, actorType: actor.actorType, actorId: actor.actorId, action },
      conn
    );
    await activityLogService.logActivity(
      {
        actorType: actor.actorType,
        actorId: actor.actorId,
        actionType: `REVIEW_${targetStatus}`,
        affectedEntityType: 'Review',
        affectedEntityId: reviewId,
        originatingModule: 'C',
      },
      conn
    );
  });

  const updated = await reviewRepository.findById(reviewId);
  return toReviewDTO(updated);
}

module.exports = {
  submitReview,
  listOwnReviews,
  updateOwnReview,
  deleteOwnReview,
  getProductReviews,
  listModerationQueue,
  moderateReview,
};
