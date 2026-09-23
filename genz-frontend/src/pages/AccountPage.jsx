import { useCustomerAuth } from "../context/CustomerAuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import Button from "../components/ui/Button";
import MyReviews from "../components/account/MyReviews";
import styles from "./AccountPage.module.css";

// No GET /customers/:id endpoint exists — the backend returns a
// customer's profile only once, at register/login time (Backend/API
// Architecture Design V1.0, Section 6). What's shown here is exactly
// that cached response, not a live refetch that doesn't exist server-side.
export default function AccountPage() {
  useDocumentTitle("My Account");
  const { customer, logout } = useCustomerAuth();

  if (!customer) return null;

  return (
    <div className={`${styles.page} container`}>
      <h1>My Account</h1>

      <div className={styles.card}>
        <h2>Profile</h2>
        <dl className={styles.list}>
          <div>
            <dt>Name</dt>
            <dd>{customer.name}</dd>
          </div>
          <div>
            <dt>Email / Phone</dt>
            <dd>{customer.contactInfo}</dd>
          </div>
        </dl>
      </div>

      <MyReviews />

      <div className={styles.actionsGrid}>
        <Button to="/account/orders" variant="dark" size="lg">
          Order History
        </Button>
        <Button to="/shop" variant="outline" size="lg">
          Continue Shopping
        </Button>
      </div>

      <button type="button" className={styles.logout} onClick={logout}>
        Log out
      </button>
    </div>
  );
}
