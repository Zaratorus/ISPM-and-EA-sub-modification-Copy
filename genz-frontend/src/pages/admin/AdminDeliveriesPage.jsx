import { useState } from "react";
import { Link } from "react-router-dom";
import { getDelivery, createDelivery } from "../../api/deliveries";
import { toApiError } from "../../api/client";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useToast } from "../../context/ToastContext";
import AdminPageHeader from "../../components/admin/AdminPageHeader";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import FormField from "../../components/forms/FormField";
import DeliveryProgress from "../../components/delivery/DeliveryProgress";
import formStyles from "../../components/forms/Form.module.css";
import { DELIVERY_STATUS_LABELS, NEXT_DELIVERY_STATUS } from "../../utils/constants";
import { formatDateTime } from "../../utils/format";

/**
 * The backend exposes no "list all deliveries" endpoint (Backend/API
 * Architecture Design V1.0, Section 6 — Module C's endpoint set is
 * exactly POST /deliveries, GET /deliveries/:id, GET/PATCH
 * /deliveries/:id/courier[/status], GET /orders/:id/delivery [Customer/
 * Admin]). This page is a direct, honest reflection of that: create a
 * delivery for a Ready-for-Delivery order, or look one up by its own ID
 * for a READ-ONLY status view. To find a delivery by ORDER instead, open
 * that order's own Admin page (Order Detail now fetches it automatically —
 * see AdminOrderDetailsPage.jsx).
 *
 * Project-owner decision (2026-09-12): once a Delivery is created, Admin
 * can no longer advance its status at all — that capability moved
 * entirely to the Delivery Person page at /delivery-tracking/:id, which
 * needs no login. Share the secure courier link shown below (it carries a
 * signed token that only works for this delivery) with whoever is making
 * the delivery; the Delivery ID alone is no longer enough.
 */
export default function AdminDeliveriesPage() {
  useDocumentTitle("Deliveries");
  const { showToast } = useToast();
  const [delivery, setDelivery] = useState(null);
  const [lookupId, setLookupId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [deliveryPersonReference, setDeliveryPersonReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleLookup(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setDelivery(await getDelivery(lookupId, "admin"));
    } catch (err) {
      setError(toApiError(err).message);
      setDelivery(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await createDelivery({
        orderId: Number(orderId),
        deliveryPersonReference: deliveryPersonReference.trim() || undefined,
      });
      setDelivery(created);
      showToast(`Delivery #${created.deliveryId} created.`, "success");
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  const trackingUrl = delivery?.courierPath ? `${window.location.origin}${delivery.courierPath}` : null;

  return (
    <div>
      <AdminPageHeader title="Deliveries" description="Create a delivery for a Ready-for-Delivery order, or look one up to view its status." />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "1.5rem" }}>
        <form className={formStyles.formCard} onSubmit={handleCreate}>
          <h3 style={{ marginBottom: "1rem" }}>Create Delivery</h3>
          <FormField label="Order ID" required>
            <input type="number" className={formStyles.input} value={orderId} onChange={(e) => setOrderId(e.target.value)} required />
          </FormField>
          <FormField label="Delivery Person (name/contact)" hint="Optional — shown to them, and recorded on each status update.">
            <input
              type="text"
              className={formStyles.input}
              value={deliveryPersonReference}
              onChange={(e) => setDeliveryPersonReference(e.target.value)}
            />
          </FormField>
          <Button type="submit" loading={busy}>
            Create
          </Button>
        </form>

        <form className={formStyles.formCard} onSubmit={handleLookup}>
          <h3 style={{ marginBottom: "1rem" }}>Look Up Delivery</h3>
          <FormField label="Delivery ID" required>
            <input type="number" className={formStyles.input} value={lookupId} onChange={(e) => setLookupId(e.target.value)} required />
          </FormField>
          <Button type="submit" variant="outline" loading={busy}>
            Look Up
          </Button>
        </form>
      </div>

      {error ? <p className={formStyles.error}>{error}</p> : null}

      {delivery ? (
        <div className={formStyles.formCard}>
          <h3 style={{ marginBottom: "0.5rem" }}>Delivery #{delivery.deliveryId}</h3>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1.25rem" }}>
            <Link to={`/admin/orders/${delivery.orderId}`} style={{ color: "var(--brand)", fontWeight: 600 }}>
              Order #{delivery.orderId}
            </Link>{" "}
            · Assigned {formatDateTime(delivery.assignedAt)}
            {delivery.deliveryPersonReference ? ` · ${delivery.deliveryPersonReference}` : ""}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem" }}>
            <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Current:</span>
            <Badge tone={delivery.status === "DELIVERED" ? "success" : "info"}>
              {DELIVERY_STATUS_LABELS[delivery.status] || delivery.status}
            </Badge>
          </div>
          <DeliveryProgress status={delivery.status} history={delivery.history} />
          {NEXT_DELIVERY_STATUS[delivery.status] ? (
            <div style={{ background: "var(--bg-muted)", borderRadius: "var(--radius-sm)", padding: "1rem", marginTop: "1.5rem" }}>
              <p style={{ margin: "0 0 0.5rem", fontSize: "0.9rem" }}>
                Admin can no longer advance this delivery. Share this secure link with the delivery person — it
                lets them view and update this delivery only:
              </p>
              <p style={{ margin: 0, fontFamily: "monospace", fontSize: "0.85rem", wordBreak: "break-all" }}>
                {trackingUrl}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
