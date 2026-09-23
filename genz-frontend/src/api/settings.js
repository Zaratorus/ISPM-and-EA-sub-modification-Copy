import { apiClient } from "./client";

// GET /settings — public path. Returns only { whatsappNumber }.
export async function getPublicSettings() {
  const { data } = await apiClient.get("/settings");
  return data.data;
}

// GET /settings — Admin path (same route, full object when authenticated).
export async function getFullSettings() {
  const { data } = await apiClient.get("/settings", { authAs: "admin" });
  return data.data;
}

// PUT /settings — Admin. body: { storeName, contactInfo, whatsappNumber }
export async function updateSettings(payload) {
  const { data } = await apiClient.put("/settings", payload, { authAs: "admin" });
  return data.data;
}
