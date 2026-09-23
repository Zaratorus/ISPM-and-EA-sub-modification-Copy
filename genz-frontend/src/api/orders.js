import { apiClient } from "./client";

// POST /orders — Customer (mandatory). body: { deliveryAddress }
export async function checkout(payload) {
  const { data } = await apiClient.post("/orders", payload, { authAs: "customer" });
  return data.data; // order detail + whatsappMessage
}

// GET /orders — Customer (own orders only)
export async function listMyOrders(params = {}) {
  const { data } = await apiClient.get("/orders", { params, authAs: "customer" });
  return data; // { data: [...], meta }
}

// GET /orders — Admin (all orders, filterable by status)
export async function listAllOrdersAdmin(params = {}) {
  const { data } = await apiClient.get("/orders", { params, authAs: "admin" });
  return data;
}

// GET /orders/:id — Customer (own) or Admin — pass whichever session is active
export async function getOrder(orderId, authAs) {
  const { data } = await apiClient.get(`/orders/${orderId}`, { authAs });
  return data.data;
}

// PATCH /orders/:id/confirm — Admin
export async function confirmOrder(orderId) {
  const { data } = await apiClient.patch(`/orders/${orderId}/confirm`, {}, { authAs: "admin" });
  return data.data;
}

// PATCH /orders/:id/status — Admin. body: { status: 'PROCESSING' | 'READY_FOR_DELIVERY' }
export async function advanceOrderStatus(orderId, status) {
  const { data } = await apiClient.patch(`/orders/${orderId}/status`, { status }, { authAs: "admin" });
  return data.data;
}

// PATCH /orders/:id/cancel — Customer (own, Pending only) or Admin (any stage)
export async function cancelOrder(orderId, authAs) {
  const { data } = await apiClient.patch(`/orders/${orderId}/cancel`, {}, { authAs });
  return data.data;
}
