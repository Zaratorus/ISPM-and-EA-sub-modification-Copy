import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { CustomerAuthProvider } from "./context/CustomerAuthContext";
import { AdminAuthProvider } from "./context/AdminAuthContext";
import { CartProvider } from "./context/CartContext";
import { ToastProvider } from "./context/ToastContext";
import StorefrontLayout from "./layouts/StorefrontLayout";
import ProtectedRoute from "./components/routing/ProtectedRoute";
import AdminProtectedRoute from "./components/routing/AdminProtectedRoute";
import LoadingSpinner from "./components/ui/LoadingSpinner";

import HomePage from "./pages/HomePage";
import ShopPage from "./pages/ShopPage";
import CategoryPage from "./pages/CategoryPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import CartPage from "./pages/CartPage";
import AboutPage from "./pages/AboutPage";
import ContactPage from "./pages/ContactPage";
import NotFoundPage from "./pages/NotFoundPage";

// Section 12 — code splitting for larger/less-frequently-hit routes.
const ProductDetailsPage = lazy(() => import("./pages/ProductDetailsPage"));
const CheckoutPage = lazy(() => import("./pages/CheckoutPage"));
const OrderConfirmationPage = lazy(() => import("./pages/OrderConfirmationPage"));
const AccountPage = lazy(() => import("./pages/AccountPage"));
const OrderHistoryPage = lazy(() => import("./pages/OrderHistoryPage"));
const OrderDetailsPage = lazy(() => import("./pages/OrderDetailsPage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));

const DeliveryTrackingPage = lazy(() => import("./pages/DeliveryTrackingPage"));

const AdminLayout = lazy(() => import("./layouts/AdminLayout"));
const AdminLoginPage = lazy(() => import("./pages/admin/AdminLoginPage"));
const AdminDashboardPage = lazy(() => import("./pages/admin/AdminDashboardPage"));
const AdminProductsPage = lazy(() => import("./pages/admin/AdminProductsPage"));
const AdminProductFormPage = lazy(() => import("./pages/admin/AdminProductFormPage"));
const AdminCategoriesPage = lazy(() => import("./pages/admin/AdminCategoriesPage"));
const AdminOrdersPage = lazy(() => import("./pages/admin/AdminOrdersPage"));
const AdminOrderDetailsPage = lazy(() => import("./pages/admin/AdminOrderDetailsPage"));
const AdminDeliveriesPage = lazy(() => import("./pages/admin/AdminDeliveriesPage"));
const AdminReviewsPage = lazy(() => import("./pages/admin/AdminReviewsPage"));
const AdminStaffPage = lazy(() => import("./pages/admin/AdminStaffPage"));
const AdminRolesPage = lazy(() => import("./pages/admin/AdminRolesPage"));
const AdminSettingsPage = lazy(() => import("./pages/admin/AdminSettingsPage"));
const AdminActivityLogPage = lazy(() => import("./pages/admin/AdminActivityLogPage"));

function PageFallback() {
  return <LoadingSpinner fullPage label="Loading…" />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <CustomerAuthProvider>
          <AdminAuthProvider>
            <CartProvider>
              <Suspense fallback={<PageFallback />}>
                <Routes>
                  {/* Public storefront */}
                  <Route element={<StorefrontLayout />}>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/shop" element={<ShopPage />} />
                    <Route path="/category/:categoryId" element={<CategoryPage />} />
                    <Route path="/products/:id" element={<ProductDetailsPage />} />
                    <Route path="/cart" element={<CartPage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                    <Route path="/about" element={<AboutPage />} />
                    <Route path="/contact" element={<ContactPage />} />

                    {/* Customer-only */}
                    <Route element={<ProtectedRoute />}>
                      <Route path="/checkout" element={<CheckoutPage />} />
                      <Route path="/orders/:id/confirmation" element={<OrderConfirmationPage />} />
                      <Route path="/account" element={<AccountPage />} />
                      <Route path="/account/orders" element={<OrderHistoryPage />} />
                      <Route path="/account/orders/:id" element={<OrderDetailsPage />} />
                    </Route>

                    <Route path="*" element={<NotFoundPage />} />
                  </Route>

                  {/* Delivery Person — public, unauthenticated (ID is the credential) */}
                  <Route path="/delivery-tracking" element={<DeliveryTrackingPage />} />
                  <Route path="/delivery-tracking/:id" element={<DeliveryTrackingPage />} />

                  {/* Admin */}
                  <Route path="/admin/login" element={<AdminLoginPage />} />
                  <Route element={<AdminProtectedRoute />}>
                    <Route path="/admin" element={<AdminLayout />}>
                      <Route index element={<AdminDashboardPage />} />
                      <Route path="products" element={<AdminProductsPage />} />
                      <Route path="products/new" element={<AdminProductFormPage />} />
                      <Route path="products/:id/edit" element={<AdminProductFormPage />} />
                      <Route path="categories" element={<AdminCategoriesPage />} />
                      <Route path="orders" element={<AdminOrdersPage />} />
                      <Route path="orders/:id" element={<AdminOrderDetailsPage />} />
                      <Route path="deliveries" element={<AdminDeliveriesPage />} />
                      <Route path="reviews" element={<AdminReviewsPage />} />
                      <Route path="staff" element={<AdminStaffPage />} />
                      <Route path="roles" element={<AdminRolesPage />} />
                      <Route path="settings" element={<AdminSettingsPage />} />
                      <Route path="activity-log" element={<AdminActivityLogPage />} />
                    </Route>
                  </Route>
                </Routes>
              </Suspense>
            </CartProvider>
          </AdminAuthProvider>
        </CustomerAuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
