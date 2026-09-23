import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { checkout } from "../api/orders";
import { toApiError } from "../api/client";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import Button from "../components/ui/Button";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import EmptyState from "../components/ui/EmptyState";
import formStyles from "../components/forms/Form.module.css";
import FormField from "../components/forms/FormField";
import { formatCurrency } from "../utils/format";
import styles from "./CheckoutPage.module.css";

/**
 * Ordering workflow, exactly as the backend implements it (Backend/API
 * Architecture Design V1.0, Section 6): POST /orders takes a delivery
 * address, creates a Pending order from the customer's cart, and returns a
 * pre-filled WhatsApp checkout message/link (whatsapp.service.js). There
 * is no bank-transfer field or endpoint anywhere in the schema — only the
 * WhatsApp flow is implemented here, not invented.
 */
export default function CheckoutPage() {
  useDocumentTitle("Checkout");
  const { items, subtotal, loading, refresh } = useCart();
  const navigate = useNavigate();
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const hasOutOfStock = items.some((i) => i.product?.availability_status === "OUT_OF_STOCK");

  // A CART_EMPTY submission error can outlive the cart state that caused it
  // (e.g. the customer adds an item after a failed attempt) — clear it once
  // the cart it was reported against no longer applies.
  useEffect(() => {
    if (items.length > 0) setError(null);
  }, [items]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const order = await checkout({ deliveryAddress: deliveryAddress.trim() });
      // The backend marks this cart CONVERTED on success (order.service.js)
      // — refresh so a later visit to /cart or /checkout reflects that
      // instead of showing the now-stale pre-checkout contents.
      await refresh();
      navigate(`/orders/${order.orderId}/confirmation`, { state: { order } });
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingSpinner fullPage label="Loading your cart…" />;

  if (items.length === 0) {
    return (
      <div className="container">
        <EmptyState
          title="Your cart is empty"
          message="Add products to your cart before checking out."
          action={<Button to="/shop">Shop Now</Button>}
        />
      </div>
    );
  }

  return (
    <div className={`${styles.page} container`}>
      <h1>Checkout</h1>

      <div className={styles.layout}>
        <form className={`${formStyles.formCard} ${styles.deliveryCard}`} onSubmit={handleSubmit} aria-label="Delivery details">
          <div className={styles.formIntro}>
            <p className={styles.eyebrow}>Almost yours</p>
            <h2 className={styles.sectionTitle}>Delivery details</h2>
            <p className={styles.introText}>
              Share where we should deliver and we&rsquo;ll confirm your order personally on WhatsApp.
            </p>
          </div>

          <FormField label="Delivery Address" required error={error}>
            <textarea
              className={formStyles.textarea}
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              placeholder="House/street, city, postal code"
              required
              minLength={1}
              maxLength={500}
            />
          </FormField>

          <p className={styles.orderNote}>
            <CheckIcon />
            After placing your order, you&rsquo;ll be shown a ready-to-send WhatsApp message to confirm it with our
            team.
          </p>

          {hasOutOfStock ? (
            <p className={formStyles.error}>
              Your cart contains an out-of-stock item. Please return to your cart before checking out.
            </p>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className={styles.submit}
            loading={submitting}
            disabled={hasOutOfStock}
          >
            Place Order
            <ArrowRightIcon />
          </Button>
        </form>

        <aside className={styles.summary}>
          <h2>Order Summary</h2>
          <ul className={styles.itemList}>
            {items.map((item) => (
              <li key={item.cartItemId}>
                <span>
                  {item.quantity} × {item.product?.name || "Product"}
                </span>
                <span>{formatCurrency((Number(item.product?.price) || 0) * item.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className={styles.totalRow}>
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={styles.noteIcon}
      aria-hidden="true"
    >
      <path d="m20 6-11 11-5-5" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
