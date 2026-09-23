import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { getDeliveryForCourier, advanceDeliveryStatusAsCourier } from "../api/deliveries";
import { toApiError } from "../api/client";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import Button from "../components/ui/Button";
import FormField from "../components/forms/FormField";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import DeliveryProgress from "../components/delivery/DeliveryProgress";
import { DELIVERY_STATUS_LABELS, NEXT_DELIVERY_STATUS } from "../utils/constants";
import { formatDateTime } from "../utils/format";
import formStyles from "../components/forms/Form.module.css";
import styles from "./DeliveryTrackingPage.module.css";

/**
 * Delivery Person surface — no login (project-owner decision, 2026-09-12:
 * delivery persons have no account). Access is by the signed courier link
 * the Admin shares after creating the Delivery record:
 *   /delivery-tracking/:id?token=<courier token>
 * The token is sent to the backend's /deliveries/:id/courier routes in the
 * X-Courier-Token header and only works for that one delivery — the
 * delivery ID alone is no longer enough. Admin cannot advance status itself
 * once a Delivery exists.
 */

const MISSING_LINK_MESSAGE = "This page needs the full courier link from the store (it includes a security code).";

// Accepts a pasted courier link (full URL or just the path) and returns its parts.
function parseCourierLink(value) {
  try {
    const url = new URL(value.trim(), window.location.origin);
    const match = url.pathname.match(/\/delivery-tracking\/(\d+)\/?$/);
    const token = url.searchParams.get("token");
    return match && token ? { id: match[1], token } : null;
  } catch {
    return null;
  }
}

export default function DeliveryTrackingPage() {
  useDocumentTitle("Delivery Tracking");
  const { id: routeId } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();
  const [linkInput, setLinkInput] = useState("");
  const [delivery, setDelivery] = useState(null);
  const [loading, setLoading] = useState(!!(routeId && token));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const missingToken = Boolean(routeId) && !token;

  const load = useCallback((deliveryId, courierToken) => {
    setLoading(true);
    setError(null);
    getDeliveryForCourier(deliveryId, courierToken)
      .then(setDelivery)
      .catch((err) => {
        setDelivery(null);
        setError(toApiError(err).message);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (routeId && token) load(routeId, token);
  }, [routeId, token, load]);

  function handleLookup(e) {
    e.preventDefault();
    const link = parseCourierLink(linkInput);
    if (!link) {
      setError("Paste the full courier link the store sent you.");
      return;
    }
    navigate(`/delivery-tracking/${link.id}?token=${encodeURIComponent(link.token)}`);
  }

  async function handleAdvance() {
    const next = NEXT_DELIVERY_STATUS[delivery.status];
    if (!next) return;
    setBusy(true);
    setError(null);
    try {
      setDelivery(await advanceDeliveryStatusAsCourier(delivery.deliveryId, token, next));
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`${styles.page} container`}>
      <div className={styles.header}>
        <p className={styles.eyebrow}>GEN-Z · Delivery Person</p>
        <h1>Delivery Tracking</h1>
        <p className={styles.sub}>Open the courier link the store sent you, or paste it below, to view and update the delivery.</p>
      </div>

      <form className={formStyles.formCard} onSubmit={handleLookup}>
        <FormField label="Courier link" required>
          <input
            type="text"
            className={formStyles.input}
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            placeholder="Paste the link from the store"
            required
          />
        </FormField>
        <Button type="submit" loading={loading}>
          Open
        </Button>
      </form>

      {loading ? <LoadingSpinner label="Loading delivery…" /> : null}
      {missingToken ? <p className={formStyles.error}>{MISSING_LINK_MESSAGE}</p> : null}
      {error ? <p className={formStyles.error}>{error}</p> : null}

      {delivery && !loading ? (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2>Delivery #{delivery.deliveryId}</h2>
            <span className={styles.orderRef}>Order #{delivery.orderId}</span>
          </div>
          <p className={styles.assignedAt}>Assigned {formatDateTime(delivery.assignedAt)}</p>

          <div className={styles.progressWrap}>
            <DeliveryProgress status={delivery.status} history={delivery.history} />
          </div>

          <div className={styles.addressBlock}>
            <h3>Deliver To</h3>
            <p>{delivery.deliveryAddress}</p>
          </div>

          {delivery.status === "DELIVERED" ? (
            <p className={styles.done}>✓ This delivery is complete.</p>
          ) : (
            <Button loading={busy} onClick={handleAdvance}>
              Mark as {DELIVERY_STATUS_LABELS[NEXT_DELIVERY_STATUS[delivery.status]]}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
