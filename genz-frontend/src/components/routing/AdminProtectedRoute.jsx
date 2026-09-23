import { Navigate, Outlet } from "react-router-dom";
import { useAdminAuth } from "../../context/AdminAuthContext";

/** Guards the entire /admin/* area behind the Owner/Admin Access Key session. */
export default function AdminProtectedRoute() {
  const { isAdmin } = useAdminAuth();

  if (!isAdmin) {
    return <Navigate to="/admin/login" replace />;
  }
  return <Outlet />;
}
