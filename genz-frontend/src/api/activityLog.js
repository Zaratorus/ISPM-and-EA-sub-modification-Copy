import { apiClient } from "./client";

// GET /activity-log — Admin. params: { originatingModule?, actionType?, page, limit }
export async function listActivityLog(params = {}) {
  const { data } = await apiClient.get("/activity-log", { params, authAs: "admin" });
  return data; // { data: [...], meta }
}
