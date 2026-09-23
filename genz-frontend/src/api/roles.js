import { apiClient } from "./client";

// GET /roles — Admin
export async function listRoles() {
  const { data } = await apiClient.get("/roles", { authAs: "admin" });
  return data.data;
}

// POST /roles — Admin. body: { name }
export async function createRole(payload) {
  const { data } = await apiClient.post("/roles", payload, { authAs: "admin" });
  return data.data;
}

// GET /permissions — Admin
export async function listPermissions() {
  const { data } = await apiClient.get("/permissions", { authAs: "admin" });
  return data.data;
}

// POST /roles/:id/permissions — Admin. body: { permissionIds: number[] }
export async function assignPermissionsToRole(roleId, permissionIds) {
  const { data } = await apiClient.post(`/roles/${roleId}/permissions`, { permissionIds }, { authAs: "admin" });
  return data.data;
}
