import { useEffect, useState } from "react";
import { getDashboard } from "../../api/dashboard";
import { toApiError } from "../../api/client";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import AdminPageHeader from "../../components/admin/AdminPageHeader";
import StatCard from "../../components/admin/StatCard";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import ErrorState from "../../components/ui/ErrorState";
import { ORDER_STATUS_LABELS } from "../../utils/constants";
import styles from "./AdminDashboardPage.module.css";

export default function AdminDashboardPage() {
  useDocumentTitle("Admin Dashboard");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  function load() {
    setData(null);
    setError(null);
    getDashboard()
      .then(setData)
      .catch((err) => setError(toApiError(err)));
  }

  useEffect(load, []);

  if (error) return <ErrorState message={error.message} onRetry={load} />;
  if (!data) return <LoadingSpinner label="Loading dashboard…" />;

  return (
    <div>
      <AdminPageHeader title="Dashboard" description="Unified operational summary across all modules." />

      <div className={styles.statGrid}>
        <StatCard label="Active Products" value={data.productCatalogue.totalActiveProducts} />
        <StatCard label="Total Orders" value={data.orders.total} />
        <StatCard label="Pending Reviews" value={data.reviews.pendingModeration} />
      </div>

      <div className={styles.section}>
        <h2>Orders by Status</h2>
        <div className={styles.statGrid}>
          {Object.entries(data.orders.byStatus).map(([status, count]) => (
            <StatCard key={status} label={ORDER_STATUS_LABELS[status] || status} value={count} />
          ))}
        </div>
      </div>

      <div className={styles.noteGrid}>
        <div className={styles.note}>
          <h3>Delivery</h3>
          <p>{data.delivery.note}</p>
        </div>
      </div>
    </div>
  );
}
