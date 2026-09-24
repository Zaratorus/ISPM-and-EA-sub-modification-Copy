import { apiClient } from "./client";

/**
 * The API returns category rows in the database's snake_case shape
 * (`category_id`), while every consumer in this app reads `categoryId`.
 * Normalize once here, at the boundary — the same approach `client.js`
 * takes with `toApiError` — so callers never have to know the wire shape.
 *
 * Every original field is preserved; `categoryId` is added alongside
 * `category_id`, so nothing that reads the raw field breaks.
 */
function normalizeCategory(row) {
  if (!row || typeof row !== "object") return row;
  return {
    ...row,
    categoryId: row.category_id ?? row.categoryId,
    variantType: row.variant_type ?? row.variantType ?? "NONE",
  };
}

// GET /categories — public
export async function listCategories() {
  const { data } = await apiClient.get("/categories");
  return Array.isArray(data.data) ? data.data.map(normalizeCategory) : [];
}

// POST /categories — Admin
export async function createCategory(payload) {
  const { data } = await apiClient.post("/categories", payload, { authAs: "admin" });
  return normalizeCategory(data.data);
}

// PUT /categories/:id — Admin
export async function updateCategory(categoryId, payload) {
  const { data } = await apiClient.put(`/categories/${categoryId}`, payload, { authAs: "admin" });
  return normalizeCategory(data.data);
}
