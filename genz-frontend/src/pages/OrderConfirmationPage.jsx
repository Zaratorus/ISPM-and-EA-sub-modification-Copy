import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { getOrder } from "../api/orders";
import { enrichOrderItems } from "../utils/enrichOrder";
import { toApiError } from "../api/client";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useCart } from "../context/CartContext";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import ErrorState from "../components/ui/ErrorState";
import Button from "../components/ui/Button";
import { formatCurrency, formatDateTime } from "../utils/format";
import styles from "./OrderConfirmationPage.module.css";

export default function OrderConfirmationPage() {
  useDocumentTitle("Order Confirmed");
  const { id } = useParams();
  const location = useLocation();
  const { refresh } = useCart();
  const [order, setOrder] = useState(location.state?.order || null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // The cart is consumed server-side at checkout — refresh so the navbar
    // badge/cart page reflect the now-empty (newly re-created) cart.
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (order?.items?.[0]?.product !== undefined) return; // Already enriched.
    const source = order ? Promise.resolve(order) : getOrder(id, "customer");
    source
      .then(enrichOrderItems)
      .then(setOrder)
      .catch((err) => setError(toApiError(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) {
    return (
      <div className="container">
        <ErrorState message={error.message} />
      </div>
    );
  }
  if (!order) return <LoadingSpinner fullPage label="Loading order…" />;

  return (
    <div className={`${styles.page} container`}>
      <div className={styles.check} aria-hidden="true">
        ✓
      </div>
      <h1 className={styles.title}>Order Placed!</h1>
      <p className={styles.subtitle}>
        Order #{order.orderId} has been received and is <strong>Pending</strong> confirmation.
      </p>

      {order.whatsappCheckoutReference ? (
        <div className={styles.whatsappCard}>
          <h2>Confirm via WhatsApp</h2>
          <p>Send us your order details to confirm and arrange payment/delivery.</p>
          {order.whatsappMessage ? <pre className={styles.messagePreview}>{order.whatsappMessage}</pre> : null}
          <Button href={order.whatsappCheckoutReference} variant="primary" size="lg">
            Order via WhatsApp
          </Button>
        </div>
      ) : null}

      <div className={styles.details}>
        <h2>Order Details</h2>
        <p className={styles.metaRow}>
          <span>Placed</span>
          <span>{formatDateTime(order.createdAt)}</span>
        </p>
        <p className={styles.metaRow}>
          <span>Delivery Address</span>
          <span>{order.deliveryAddress}</span>
        </p>
        <ul className={styles.itemList}>
          {order.items.map((item) => (
            <li key={item.orderItemId}>
              <span>
                {item.quantity} × {item.product?.name || `Product #${item.productId}`}
              </span>
              <span>{formatCurrency(Number(item.priceSnapshot) * item.quantity)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.actions}>
        <Button to="/shop" variant="outline">
          Continue Shopping
        </Button>
        <Button to={`/account/orders/${order.orderId}`} variant="ghost">
          View Order Status →
        </Button>
      </div>
    </div>
  );
}
