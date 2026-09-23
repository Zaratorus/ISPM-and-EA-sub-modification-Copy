import { apiClient } from "./client";

// GET /staff — Admin
export async function listStaff() {
  const { data } = await apiClient.get("/staff", { authAs: "admin" });
  return data.data;
}

// POST /staff — Admin (Owner-Access-Key session only, per backend). body: { name, roleId }
export async function createStaff(payload) {
  const { data } = await apiClient.post("/staff", payload, { authAs: "admin" });
  return data.data;
}

// PUT /staff/:id — Admin. body: { name?, roleId? }
export async function updateStaff(staffId, payload) {
  const { data } = await apiClient.put(`/staff/${staffId}`, payload, { authAs: "admin" });
  return data.data;
}

// PATCH /staff/:id/deactivate — Admin
export async function deactivateStaff(staffId) {
  const { data } = await apiClient.patch(`/staff/${staffId}/deactivate`, {}, { authAs: "admin" });
  return data.data;
}
