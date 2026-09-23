import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { adminLogout, validateAccessKey } from "../api/adminAuth";
import { ADMIN_TOKEN_KEY, toApiError } from "../api/client";

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [isAdmin, setIsAdmin] = useState(() => !!localStorage.getItem(ADMIN_TOKEN_KEY));

  const login = useCallback(async (accessKey) => {
    try {
      const { token } = await validateAccessKey(accessKey);
      localStorage.setItem(ADMIN_TOKEN_KEY, token);
      setIsAdmin(true);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: toApiError(err) };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      if (localStorage.getItem(ADMIN_TOKEN_KEY)) await adminLogout();
    } catch {
      // Session may already be invalid server-side — clear locally regardless.
    } finally {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      setIsAdmin(false);
    }
  }, []);

  useEffect(() => {
    function onUnauthorized() {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      setIsAdmin(false);
    }
    window.addEventListener("genz:admin-unauthorized", onUnauthorized);
    return () => window.removeEventListener("genz:admin-unauthorized", onUnauthorized);
  }, []);

  const value = useMemo(() => ({ isAdmin, login, logout }), [isAdmin, login, logout]);

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth() must be used within an AdminAuthProvider");
  return ctx;
}
