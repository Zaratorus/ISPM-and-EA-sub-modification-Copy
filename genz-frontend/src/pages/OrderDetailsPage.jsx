import { useEffect, useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { getOrder, cancelOrder } from "../api/orders";
import { getDeliveryByOrder } from "../api/deliveries";
import { enrichOrderItems } from "../utils/enrichOrder";
import { toApiError } from "../api/client";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useToast } from "../context/ToastContext";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import ErrorState from "../components/ui/ErrorState";
import DeliveryProgress from "../components/delivery/DeliveryProgress";
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONE } from "../utils/constants";
import { formatCurrency, formatDateTime } from "../utils/format";
import styles from "./OrderDetailsPage.module.css";

export default function OrderDetailsPage() {
  useDocumentTitle("Order Details");
  const { id } = useParams();
  const { showToast } = useToast();
  const [order, setOrder] = useState(null);
  const [delivery, setDelivery] = useState(null);
  const [error, setError] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(() => {
    setOrder(null);
    setError(null);
    getOrder(id, "customer")
      .then(enrichOrderItems)
      .then(setOrder)
      .catch((err) => setError(toApiError(err)));

    getDeliveryByOrder(id)
      .then(setDelivery)
      .catch(() => setDelivery(null));
  }, [id]);

  useEffect(load, [load]);

  async function handleCancel() {
    if (!window.confirm("Cancel this order? This cannot be undone.")) return;
    setCancelling(true);
    try {
      await cancelOrder(id, "customer");
      showToast("Order cancelled.", "success");
      load();
    } catch (err) {
      showToast(toApiError(err).message, "error");
    } finally {
      setCancelling(false);
    }
  }

  if (error) {
    return (
      <div className="container">
        <ErrorState
          title={error.status === 404 ? "Order not found" : "Unable to load this order"}
          message={error.message}
          onRetry={load}
        />
      </div>
    );
  }
  if (!order) return <LoadingSpinner fullPage label="Loading order…" />;

  const canCancel = order.status === "PENDING";

  return (
    <div className={`${styles.page} container`}>
      <Link to="/account/orders" className={styles.back}>
        ← Back to Order History
      </Link>

      <div className={styles.headerRow}>
        <div>
          <h1>Order #{order.orderId}</h1>
          <p className={styles.placed}>Placed {formatDateTime(order.createdAt)}</p>
        </div>
        <Badge tone={ORDER_STATUS_TONE[order.status] || "neutral"}>
          {ORDER_STATUS_LABELS[order.status] || order.status}
        </Badge>
      </div>

      {delivery ? (
        <div className={styles.deliveryCard}>
          <h2>Delivery Status</h2>
          {delivery.status === "DELIVERED" ? (
            <p className={styles.deliveredTick}>✓ Delivered</p>
          ) : null}
          <DeliveryProgress status={delivery.status} history={delivery.history} />
          {delivery.status === "DELIVERED" ? (
            <p className={styles.deliveryHint}>
              You can now <Link to={`/products/${order.items[0]?.productId}`}>write a review</Link> for items in
              this order.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={styles.card}>
        <h2>Items</h2>
        <ul className={styles.itemList}>
          {order.items.map((item) => (
            <li key={item.orderItemId}>
              <Link to={`/products/${item.productId}`} className={styles.itemName}>
                {item.product?.name || `Product #${item.productId}`}
              </Link>
              <span className={styles.itemQty}>× {item.quantity}</span>
              <span className={styles.itemPrice}>{formatCurrency(Number(item.priceSnapshot) * item.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className={styles.totalRow}>
          <span>Total</span>
          <span>{formatCurrency(order.items.reduce((sum, i) => sum + Number(i.priceSnapshot) * i.quantity, 0))}</span>
        </div>
      </div>

      <div className={styles.card}>
        <h2>Delivery Address</h2>
        <p>{order.deliveryAddress}</p>
      </div>

      <div className={styles.actions}>
        {canCancel ? (
          <Button variant="danger" onClick={handleCancel} loading={cancelling}>
            Cancel Order
          </Button>
        ) : null}
        <Button to="/shop" variant="outline">
          Continue Shopping
        </Button>
      </div>
    </div>
  );
}
