/**
 * products.js — Module A (Product & Catalogue).
 * Matches Backend/API Architecture Design V1.0, Section 6 exactly.
 */
import { apiClient } from "./client";

// GET /products — public. filters: { categoryId, name, minPrice, maxPrice, page, limit }
export async function searchProducts(filters = {}) {
  const { data } = await apiClient.get("/products", { params: filters });
  return data; // { data: [...products], meta: { page, limit, total } }
}

// GET /products/:id — public
export async function getProduct(productId) {
  const { data } = await apiClient.get(`/products/${productId}`);
  return data.data;
}

// POST /products — Admin
export async function createProduct(payload) {
  const { data } = await apiClient.post("/products", payload, { authAs: "admin" });
  return data.data;
}

// PUT /products/:id — Admin
export async function updateProduct(productId, payload) {
  const { data } = await apiClient.put(`/products/${productId}`, payload, { authAs: "admin" });
  return data.data;
}

// DELETE /products/:id — Admin (soft delete, status becomes DISCONTINUED)
export async function discontinueProduct(productId) {
  const { data } = await apiClient.delete(`/products/${productId}`, { authAs: "admin" });
  return data.data;
}

// PATCH /products/:id/stock — Admin. body: { newQuantity, reason }
export async function adjustStock(productId, payload) {
  const { data } = await apiClient.patch(`/products/${productId}/stock`, payload, { authAs: "admin" });
  return data.data;
}

// POST /products/:id/images — Admin. body: { imageReference, sortOrder? }
export async function addProductImage(productId, payload) {
  const { data } = await apiClient.post(`/products/${productId}/images`, payload, { authAs: "admin" });
  return data.data;
}
