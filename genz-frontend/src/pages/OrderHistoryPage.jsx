import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listMyOrders } from "../api/orders";
import { toApiError } from "../api/client";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import ErrorState from "../components/ui/ErrorState";
import EmptyState from "../components/ui/EmptyState";
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONE } from "../utils/constants";
import { formatDate } from "../utils/format";
import styles from "./OrderHistoryPage.module.css";

export default function OrderHistoryPage() {
  useDocumentTitle("Order History");
  const [state, setState] = useState({ orders: [], loading: true, error: null });

  function load() {
    setState((s) => ({ ...s, loading: true, error: null }));
    listMyOrders({ page: 1, limit: 50 })
      .then((res) => setState({ orders: res.data, loading: false, error: null }))
      .catch((err) => setState({ orders: [], loading: false, error: toApiError(err) }));
  }

  useEffect(load, []);

  return (
    <div className={`${styles.page} container`}>
      <h1>Order History</h1>

      {state.loading ? (
        <LoadingSpinner label="Loading your orders…" />
      ) : state.error ? (
        <ErrorState message={state.error.message} onRetry={load} />
      ) : state.orders.length === 0 ? (
        <EmptyState
          title="No orders yet"
          message="Once you place an order, it will show up here."
          action={<Button to="/shop">Start Shopping</Button>}
        />
      ) : (
        <div className={styles.list}>
          {state.orders.map((order) => (
            <Link key={order.orderId} to={`/account/orders/${order.orderId}`} className={styles.row}>
              <div>
                <p className={styles.orderId}>Order #{order.orderId}</p>
                <p className={styles.date}>{formatDate(order.createdAt)}</p>
              </div>
              <Badge tone={ORDER_STATUS_TONE[order.status] || "neutral"}>
                {ORDER_STATUS_LABELS[order.status] || order.status}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
