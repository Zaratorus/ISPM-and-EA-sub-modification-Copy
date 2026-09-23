import { useCart } from "../context/CartContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import CartItemRow from "../components/cart/CartItemRow";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import ErrorState from "../components/ui/ErrorState";
import Breadcrumb from "../components/ui/Breadcrumb";
import { formatCurrency } from "../utils/format";
import styles from "./CartPage.module.css";

export default function CartPage() {
  useDocumentTitle("Your Cart");
  const { items, subtotal, loading, error, refresh } = useCart();

  const hasOutOfStock = items.some((i) => i.product?.availability_status === "OUT_OF_STOCK");

  return (
    <div className={`${styles.page} container`}>
      <Breadcrumb items={[{ label: "Home", to: "/" }, { label: "Shop", to: "/shop" }, { label: "Your Cart" }]} />
      <h1>Your Cart</h1>

      {loading ? (
        <LoadingSpinner label="Loading your cart…" />
      ) : error ? (
        <ErrorState message={error.message} onRetry={refresh} />
      ) : items.length === 0 ? (
        <EmptyState
          title="Your cart is empty"
          message="Browse the collection and add something you love."
          icon="🛍"
          action={<Button to="/shop">Continue Shopping</Button>}
        />
      ) : (
        <div className={styles.layout}>
          <div className={styles.list}>
            {items.map((item) => (
              <CartItemRow key={item.cartItemId} item={item} />
            ))}
          </div>

          <aside className={styles.summary}>
            <h2>Order Summary</h2>
            <div className={styles.row}>
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <p className={styles.note}>Delivery details are confirmed at checkout.</p>

            {hasOutOfStock ? (
              <p className={styles.warning}>
                One or more items in your cart are out of stock — remove them or reduce quantity before checking out.
              </p>
            ) : null}

            <Button to="/checkout" variant="primary" size="lg" disabled={hasOutOfStock} className={styles.checkoutBtn}>
              Proceed to Checkout
            </Button>
            <Button to="/shop" variant="ghost" className={styles.continueBtn}>
              ← Continue Shopping
            </Button>
          </aside>
        </div>
      )}
    </div>
  );
}
