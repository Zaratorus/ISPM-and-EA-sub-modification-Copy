import { apiClient } from "./client";

// POST /reviews — Customer. body: { orderId, productId, rating, reviewText? }
// Backend validates Delivered + verified-purchase + one active review per
// product/order server-side.
export async function submitReview(payload) {
  const { data } = await apiClient.post("/reviews", payload, { authAs: "customer" });
  return data.data;
}

// GET /reviews/mine — Customer. The logged-in customer's own reviews (deleted
// ones excluded), each with productName and status.
export async function listMyReviews(params = {}) {
  const { data } = await apiClient.get("/reviews/mine", { params, authAs: "customer" });
  return data; // { data: [...], meta }
}

// PATCH /reviews/:id — Customer. body: { rating?, reviewText? }. The edited
// review goes back to Pending Moderation.
export async function updateMyReview(reviewId, changes) {
  const { data } = await apiClient.patch(`/reviews/${reviewId}`, changes, { authAs: "customer" });
  return data.data;
}

// DELETE /reviews/:id — Customer (soft delete).
export async function deleteMyReview(reviewId) {
  const { data } = await apiClient.delete(`/reviews/${reviewId}`, { authAs: "customer" });
  return data.data;
}

// GET /products/:id/reviews — public. Approved reviews + aggregate rating only.
export async function getProductReviews(productId, params = {}) {
  const { data } = await apiClient.get(`/products/${productId}/reviews`, { params });
  return data; // { data: [...], meta: { page, limit, total, averageRating } }
}

// GET /reviews — Admin. params: { status?: 'PENDING_MODERATION'|'APPROVED'|'REJECTED'|'DELETED', page?, limit? }
// (status defaults to Pending Moderation on the backend).
export async function listModerationQueue(params = {}) {
  const { data } = await apiClient.get("/reviews", { params, authAs: "admin" });
  return data;
}

// PATCH /reviews/:id/moderate — Admin. body: { action: 'APPROVE'|'REJECT'|'DELETE' }
export async function moderateReview(reviewId, action) {
  const { data } = await apiClient.patch(`/reviews/${reviewId}/moderate`, { action }, { authAs: "admin" });
  return data.data;
}
