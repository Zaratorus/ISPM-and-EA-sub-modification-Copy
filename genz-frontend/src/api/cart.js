/**
 * cart.js — Module B. Every endpoint requires an authenticated Customer
 * session (Backend/API Architecture Design V1.0, Section 15 item 2 —
 * "Cart only created post-login", the resolved guest-cart-persistence
 * decision). There is no guest/local cart path on the backend.
 */
import { apiClient } from "./client";

// GET /cart — Customer
export async function getCart() {
  const { data } = await apiClient.get("/cart", { authAs: "customer" });
  return data.data; // { cartId, items: [{ cartItemId, productId, quantity }] }
}

// POST /cart/items — Customer. body: { productId, quantity }
export async function addCartItem(payload) {
  const { data } = await apiClient.post("/cart/items", payload, { authAs: "customer" });
  return data.data;
}

// PUT /cart/items/:id — Customer. body: { quantity }
export async function updateCartItem(cartItemId, quantity) {
  const { data } = await apiClient.put(`/cart/items/${cartItemId}`, { quantity }, { authAs: "customer" });
  return data.data;
}

// DELETE /cart/items/:id — Customer
export async function removeCartItem(cartItemId) {
  const { data } = await apiClient.delete(`/cart/items/${cartItemId}`, { authAs: "customer" });
  return data.data;
}
