import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listAllOrdersAdmin } from "../../api/orders";
import { toApiError } from "../../api/client";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import AdminPageHeader from "../../components/admin/AdminPageHeader";
import AdminTable from "../../components/admin/AdminTable";
import Badge from "../../components/ui/Badge";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import ErrorState from "../../components/ui/ErrorState";
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONE } from "../../utils/constants";
import { formatDateTime } from "../../utils/format";
import formStyles from "../../components/forms/Form.module.css";

const STATUSES = ["", "PENDING", "CONFIRMED", "PROCESSING", "READY_FOR_DELIVERY", "CANCELLED"];

export default function AdminOrdersPage() {
  useDocumentTitle("Manage Orders");
  const [status, setStatus] = useState("");
  const [state, setState] = useState({ orders: [], loading: true, error: null });

  function load() {
    setState((s) => ({ ...s, loading: true, error: null }));
    listAllOrdersAdmin({ page: 1, limit: 100, status: status || undefined })
      .then((res) => setState({ orders: res.data, loading: false, error: null }))
      .catch((err) => setState({ orders: [], loading: false, error: toApiError(err) }));
  }

  useEffect(load, [status]);

  return (
    <div>
      <AdminPageHeader title="Orders" description="All customer orders across the storefront." />

      <div style={{ marginBottom: "1.5rem", maxWidth: 240 }}>
        <select className={formStyles.select} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.filter(Boolean).map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {state.loading ? (
        <LoadingSpinner label="Loading orders…" />
      ) : state.error ? (
        <ErrorState message={state.error.message} onRetry={load} />
      ) : (
        <AdminTable
          rowKey="orderId"
          rows={state.orders}
          columns={[
            { key: "orderId", label: "Order #", render: (o) => <Link to={`/admin/orders/${o.orderId}`}>#{o.orderId}</Link> },
            { key: "customerId", label: "Customer ID" },
            { key: "createdAt", label: "Placed", render: (o) => formatDateTime(o.createdAt) },
            {
              key: "status",
              label: "Status",
              render: (o) => <Badge tone={ORDER_STATUS_TONE[o.status] || "neutral"}>{ORDER_STATUS_LABELS[o.status] || o.status}</Badge>,
            },
          ]}
        />
      )}
    </div>
  );
}
