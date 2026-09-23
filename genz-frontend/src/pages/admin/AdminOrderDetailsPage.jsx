import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getOrder, confirmOrder, advanceOrderStatus, cancelOrder } from "../../api/orders";
import { createDelivery, getDeliveryByOrder } from "../../api/deliveries";
import { enrichOrderItems } from "../../utils/enrichOrder";
import { toApiError } from "../../api/client";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useToast } from "../../context/ToastContext";
import AdminPageHeader from "../../components/admin/AdminPageHeader";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import ErrorState from "../../components/ui/ErrorState";
import DeliveryProgress from "../../components/delivery/DeliveryProgress";
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONE, DELIVERY_STATUS_LABELS, NEXT_DELIVERY_STATUS } from "../../utils/constants";
import { formatCurrency, formatDateTime } from "../../utils/format";
import formStyles from "../../components/forms/Form.module.css";

const NEXT_ORDER_STATUS = { CONFIRMED: "PROCESSING", PROCESSING: "READY_FOR_DELIVERY" };

export default function AdminOrderDetailsPage() {
  useDocumentTitle("Order Detail");
  const { id } = useParams();
  const { showToast } = useToast();
  const [order, setOrder] = useState(null);
  const [delivery, setDelivery] = useState(null);
  const [deliveryChecked, setDeliveryChecked] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    getOrder(id, "admin")
      .then(enrichOrderItems)
      .then(setOrder)
      .catch((err) => setError(toApiError(err)));

    // GET /orders/:id/delivery was widened to Admin (2026-09-12) — this now
    // persists across visits instead of only showing right after creation.
    setDeliveryChecked(false);
    getDeliveryByOrder(id, "admin")
      .then(setDelivery)
      .catch(() => setDelivery(null))
      .finally(() => setDeliveryChecked(true));
  }, [id]);

  useEffect(load, [load]);

  async function runAction(action, { keepDelivery = false } = {}) {
    setBusy(true);
    try {
      const result = await action();
      if (!keepDelivery) load();
      return result;
    } catch (err) {
      showToast(toApiError(err).message, "error");
      return null;
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorState message={error.message} onRetry={load} />;
  if (!order) return <LoadingSpinner label="Loading order…" />;

  const nextStatus = NEXT_ORDER_STATUS[order.status];
  const nextDeliveryStatus = delivery ? NEXT_DELIVERY_STATUS[delivery.status] : null;

  return (
    <div>
      <AdminPageHeader
        title={`Order #${order.orderId}`}
        description={`Placed ${formatDateTime(order.createdAt)} · Customer #${order.customerId}`}
        action={<Badge tone={ORDER_STATUS_TONE[order.status] || "neutral"}>{ORDER_STATUS_LABELS[order.status] || order.status}</Badge>}
      />

      <div className={formStyles.formCard} style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ marginBottom: "1rem" }}>Items</h3>
        <ul style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
          {order.items.map((item) => (
            <li key={item.orderItemId} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem" }}>
              <span>
                {item.quantity} × {item.product?.name || `Product #${item.productId}`}
              </span>
              <span>{formatCurrency(Number(item.priceSnapshot) * item.quantity)}</span>
            </li>
          ))}
        </ul>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Delivery Address: {order.deliveryAddress}</p>
      </div>

      <div className={formStyles.formCard} style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ marginBottom: "1rem" }}>Order Actions</h3>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          {order.status === "PENDING" ? (
            <Button loading={busy} onClick={() => runAction(() => confirmOrder(order.orderId))}>
              Confirm Order (decreases stock)
            </Button>
          ) : null}
          {nextStatus ? (
            <Button
              variant="outline"
              loading={busy}
              onClick={() => runAction(() => advanceOrderStatus(order.orderId, nextStatus))}
            >
              Advance to {ORDER_STATUS_LABELS[nextStatus]}
            </Button>
          ) : null}
          {order.status !== "CANCELLED" ? (
            <Button
              variant="danger"
              loading={busy}
              onClick={() => {
                if (window.confirm("Cancel this order?")) runAction(() => cancelOrder(order.orderId, "admin"));
              }}
            >
              Cancel Order
            </Button>
          ) : null}
        </div>
      </div>

      <div className={formStyles.formCard}>
        <h3 style={{ marginBottom: "1rem" }}>Delivery</h3>
        {!deliveryChecked ? (
          <LoadingSpinner label="Checking delivery status…" />
        ) : delivery ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem" }}>
              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Current:</span>
              <Badge tone={delivery.status === "DELIVERED" ? "success" : "info"}>
                {DELIVERY_STATUS_LABELS[delivery.status] || delivery.status}
              </Badge>
            </div>
            <DeliveryProgress status={delivery.status} history={delivery.history} />
            {nextDeliveryStatus ? (
              <div style={{ background: "var(--bg-muted)", borderRadius: "var(--radius-sm)", padding: "1rem", marginTop: "1.5rem" }}>
                <p style={{ margin: "0 0 0.5rem", fontSize: "0.9rem" }}>
                  Admin can no longer advance this delivery — share this secure link with the delivery person, who can
                  view and update it themselves (no login needed; the link only works for this delivery):
                </p>
                <p style={{ margin: 0, fontFamily: "monospace", fontSize: "0.85rem", wordBreak: "break-all" }}>
                  {window.location.origin}
                  {delivery.courierPath}
                </p>
              </div>
            ) : null}
          </>
        ) : order.status === "READY_FOR_DELIVERY" ? (
          <Button
            loading={busy}
            onClick={async () => {
              const created = await runAction(() => createDelivery({ orderId: order.orderId }), { keepDelivery: true });
              if (created) setDelivery(created);
            }}
          >
            Create Delivery Record
          </Button>
        ) : (
          <p style={{ color: "var(--text-muted)" }}>
            No delivery record yet — available once the order reaches Ready for Delivery.
          </p>
        )}
      </div>

      <p style={{ marginTop: "1.5rem" }}>
        <Link to="/admin/orders" style={{ color: "var(--brand)", fontWeight: 600 }}>
          ← Back to Orders
        </Link>
      </p>
    </div>
  );
}
