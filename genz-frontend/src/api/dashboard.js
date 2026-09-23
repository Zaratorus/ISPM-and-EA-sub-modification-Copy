import { apiClient } from "./client";

// GET /dashboard — Admin
export async function getDashboard() {
  const { data } = await apiClient.get("/dashboard", { authAs: "admin" });
  return data.data;
}
