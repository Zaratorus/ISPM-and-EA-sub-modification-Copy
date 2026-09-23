import { apiClient } from "./client";

// POST /admin/access-key/validate — public (rate-limited server-side).
// body: { accessKey }
export async function validateAccessKey(accessKey) {
  const { data } = await apiClient.post("/admin/access-key/validate", { accessKey });
  return data.data; // { token }
}

// POST /admin/logout — Admin
export async function adminLogout() {
  await apiClient.post("/admin/logout", {}, { authAs: "admin" });
}
