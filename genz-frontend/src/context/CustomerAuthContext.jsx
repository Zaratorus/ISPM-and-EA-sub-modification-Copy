import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { loginCustomer, registerCustomer } from "../api/customerAuth";
import { CUSTOMER_PROFILE_KEY, CUSTOMER_TOKEN_KEY, toApiError } from "../api/client";

const CustomerAuthContext = createContext(null);

function readStoredProfile() {
  try {
    const raw = localStorage.getItem(CUSTOMER_PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function CustomerAuthProvider({ children }) {
  const [customer, setCustomer] = useState(readStoredProfile);
  const ready = true;

  const persist = useCallback((profile, token) => {
    localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
    localStorage.setItem(CUSTOMER_PROFILE_KEY, JSON.stringify(profile));
    setCustomer(profile);
  }, []);

  const login = useCallback(
    async ({ contactInfo, password }) => {
      try {
        const result = await loginCustomer({ contactInfo, password });
        const { token, ...profile } = result;
        persist(profile, token);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: toApiError(err) };
      }
    },
    [persist]
  );

  const register = useCallback(
    async ({ name, contactInfo, password }) => {
      try {
        const result = await registerCustomer({ name, contactInfo, password });
        const { token, ...profile } = result;
        persist(profile, token);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: toApiError(err) };
      }
    },
    [persist]
  );

  const logout = useCallback(() => {
    localStorage.removeItem(CUSTOMER_TOKEN_KEY);
    localStorage.removeItem(CUSTOMER_PROFILE_KEY);
    setCustomer(null);
  }, []);

  // If a customer request ever comes back 401 (expired/invalid token),
  // sign the customer out client-side so the UI reflects reality.
  useEffect(() => {
    function onUnauthorized() {
      logout();
    }
    window.addEventListener("genz:customer-unauthorized", onUnauthorized);
    return () => window.removeEventListener("genz:customer-unauthorized", onUnauthorized);
  }, [logout]);

  const value = useMemo(
    () => ({ customer, isAuthenticated: !!customer, ready, login, register, logout }),
    [customer, ready, login, register, logout]
  );

  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}

export function useCustomerAuth() {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error("useCustomerAuth() must be used within a CustomerAuthProvider");
  return ctx;
}
