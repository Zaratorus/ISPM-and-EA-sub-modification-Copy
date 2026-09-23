import { apiClient } from "./client";

// POST /auth/customer/register — public. body: { name, contactInfo, password }
export async function registerCustomer(payload) {
  const { data } = await apiClient.post("/auth/customer/register", payload);
  return data.data; // { customerId, name, contactInfo, token }
}

// POST /auth/customer/login — public. body: { contactInfo, password }
export async function loginCustomer(payload) {
  const { data } = await apiClient.post("/auth/customer/login", payload);
  return data.data; // { customerId, name, contactInfo, token }
}

// ---- Forgot password (emailed one-time code). All public: no authAs, so no
// token is ever attached, even when a customer happens to be logged in.

// POST /auth/customer/password/forgot — body: { email }. Always the same
// generic message, whether or not an account exists.
export async function requestPasswordReset(email) {
  const { data } = await apiClient.post("/auth/customer/password/forgot", { email });
  return data.data; // { message }
}

// POST /auth/customer/password/verify-otp — body: { email, otp }. Checks the
// code without using it up.
export async function verifyPasswordResetOtp({ email, otp }) {
  const { data } = await apiClient.post("/auth/customer/password/verify-otp", { email, otp });
  return data.data; // { verified: true }
}

// POST /auth/customer/password/reset — body: { email, otp, newPassword,
// confirmPassword }. No token is returned: the customer logs in again.
export async function resetCustomerPassword({ email, otp, newPassword, confirmPassword }) {
  const { data } = await apiClient.post("/auth/customer/password/reset", { email, otp, newPassword, confirmPassword });
  return data.data; // { message }
}
