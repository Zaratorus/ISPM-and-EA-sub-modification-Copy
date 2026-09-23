import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useCustomerAuth } from "../../context/CustomerAuthContext";

/** Guards customer-only routes (account, orders, checkout). */
export default function ProtectedRoute() {
  const { isAuthenticated } = useCustomerAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}
