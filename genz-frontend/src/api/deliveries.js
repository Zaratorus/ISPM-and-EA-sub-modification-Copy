import { apiClient } from "./client";

// GET /orders/:id/delivery — Customer (own) / Admin (widened 2026-09-12 —
// this closed the long-standing "no admin lookup by order ID" gap).
// 404-shaped error if none exists yet. Admin responses also carry the
// delivery's signed courier link (courierToken, courierPath); customer
// responses never do.
export async function getDeliveryByOrder(orderId, authAs = "customer") {
  const { data } = await apiClient.get(`/orders/${orderId}/delivery`, { authAs });
  return data.data;
}

// GET /deliveries/:id — Customer (own, via order) or Admin (Admin responses
// include courierToken/courierPath, as above).
export async function getDelivery(deliveryId, authAs) {
  const { data } = await apiClient.get(`/deliveries/${deliveryId}`, { authAs });
  return data.data;
}

// POST /deliveries — Admin. body: { orderId, deliveryPersonReference? }.
// The response includes the new delivery's courierToken and courierPath.
export async function createDelivery(payload) {
  const { data } = await apiClient.post("/deliveries", payload, { authAs: "admin" });
  return data.data;
}

// GET /deliveries/:id/courier — Delivery Person (no account). Requires the
// signed courier token from the link the Admin shares, sent in the
// X-Courier-Token header. No `authAs` is passed, so client.js attaches no
// Authorization header.
export async function getDeliveryForCourier(deliveryId, courierToken) {
  const { data } = await apiClient.get(`/deliveries/${deliveryId}/courier`, {
    headers: { "X-Courier-Token": courierToken },
  });
  return data.data;
}

// PATCH /deliveries/:id/courier/status — Delivery Person, same courier token.
// The only way a Delivery's status advances beyond Assigned — there is no
// Admin-facing equivalent any more.
export async function advanceDeliveryStatusAsCourier(deliveryId, courierToken, status) {
  const { data } = await apiClient.patch(
    `/deliveries/${deliveryId}/courier/status`,
    { status },
    { headers: { "X-Courier-Token": courierToken } }
  );
  return data.data;
}
