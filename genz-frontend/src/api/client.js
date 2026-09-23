/**
 * client.js
 * Single centralized Axios instance for every backend call. Base URL comes
 * from VITE_API_URL (see .env.example) — never hardcoded elsewhere.
 *
 * Two separate bearer tokens exist because the backend has two entirely
 * separate session types (Backend/API Architecture Design V1.0, Section 7):
 *   - a Customer JWT (issued by POST /auth/customer/login|register)
 *   - an Owner/Admin session JWT (issued by POST /admin/access-key/validate)
 * A request carries whichever token is relevant to the call being made —
 * see the `authAs` option on each api/*.js function. Sending both, or the
 * wrong one, would not match how the backend's two auth middlewares work
 * (each accepts only its own token shape).
 */

import axios from "axios";

const baseURL = import.meta.env.VITE_API_URL || "http://localhost:4000/api/v1";

export const CUSTOMER_TOKEN_KEY = "genz_customer_token";
export const CUSTOMER_PROFILE_KEY = "genz_customer_profile";
export const ADMIN_TOKEN_KEY = "genz_admin_token";

export const apiClient = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.request.use((config) => {
  const authAs = config.authAs;
  if (authAs === "customer") {
    const token = localStorage.getItem(CUSTOMER_TOKEN_KEY);
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } else if (authAs === "admin") {
    const token = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// A 401 on a customer/admin-scoped call means that session's token is
// missing/expired/invalid — let the relevant auth context clear itself so
// the UI never keeps showing a "logged in" state the backend has rejected.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const authAs = error.config?.authAs;
      if (authAs === "customer") {
        window.dispatchEvent(new Event("genz:customer-unauthorized"));
      } else if (authAs === "admin") {
        window.dispatchEvent(new Event("genz:admin-unauthorized"));
      }
    }
    return Promise.reject(error);
  }
);

/**
 * Normalizes every backend error into a plain, predictable shape so pages
 * never need to know Axios's response/request/message distinction.
 * Backend error envelope (error-handler.middleware.js): { error: { code, message } }.
 */
export function toApiError(err) {
  if (err.response) {
    const body = err.response.data;
    return {
      status: err.response.status,
      code: body?.error?.code || "UNKNOWN_ERROR",
      message: body?.error?.message || "Something went wrong. Please try again.",
    };
  }
  if (err.request) {
    return {
      status: 0,
      code: "NETWORK_ERROR",
      message: "Unable to reach the server. Check your connection and try again.",
    };
  }
  return { status: 0, code: "CLIENT_ERROR", message: err.message || "Unexpected error." };
}

/** Session-expiry helper — pages/contexts decide what to do with this signal. */
export function isAuthError(apiError) {
  return apiError.status === 401;
}
