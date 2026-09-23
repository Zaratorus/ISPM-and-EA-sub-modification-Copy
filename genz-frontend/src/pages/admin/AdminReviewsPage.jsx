import { useEffect, useState } from "react";
import { listModerationQueue, moderateReview } from "../../api/reviews";
import { toApiError } from "../../api/client";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useToast } from "../../context/ToastContext";
import AdminPageHeader from "../../components/admin/AdminPageHeader";
import StarRating from "../../components/ui/StarRating";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import ErrorState from "../../components/ui/ErrorState";
import EmptyState from "../../components/ui/EmptyState";
import {
  MODERATION_STATUS_LABELS,
  MODERATION_STATUS_TONE,
  MODERATION_ACTIONS_BY_STATUS,
} from "../../utils/constants";
import { formatDate } from "../../utils/format";
import formStyles from "../../components/forms/Form.module.css";

const STATUSES = ["PENDING_MODERATION", "APPROVED", "REJECTED", "DELETED"];
const ACTION_BUTTONS = {
  APPROVE: { label: "Approve", variant: "primary" },
  REJECT: { label: "Reject", variant: "outline" },
  DELETE: { label: "Delete", variant: "danger" },
};

export default function AdminReviewsPage() {
  useDocumentTitle("Review Moderation");
  const { showToast } = useToast();
  const [status, setStatus] = useState("PENDING_MODERATION");
  const [state, setState] = useState({ reviews: [], loading: true, error: null });
  const [busyId, setBusyId] = useState(null);

  function load() {
    setState((s) => ({ ...s, loading: true, error: null }));
    listModerationQueue({ page: 1, limit: 50, status })
      .then((res) => setState({ reviews: res.data, loading: false, error: null }))
      .catch((err) => setState({ reviews: [], loading: false, error: toApiError(err) }));
  }

  useEffect(load, [status]);

  async function handleModerate(review, action) {
    setBusyId(review.reviewId);
    try {
      await moderateReview(review.reviewId, action);
      showToast(`Review ${action.toLowerCase()}d.`, "success");
      load();
    } catch (err) {
      showToast(toApiError(err).message, "error");
    } finally {
      setBusyId(null);
    }
  }

  if (state.error) return <ErrorState message={state.error.message} onRetry={load} />;

  return (
    <div>
      <AdminPageHeader title="Review Moderation" description="Moderate customer reviews by status." />

      <div style={{ marginBottom: "1.5rem", maxWidth: 240 }}>
        <select className={formStyles.select} value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {MODERATION_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {state.loading ? (
        <LoadingSpinner label="Loading reviews…" />
      ) : state.reviews.length === 0 ? (
        <EmptyState
          title={status === "PENDING_MODERATION" ? "Queue is clear" : "No reviews"}
          message={`No reviews are ${MODERATION_STATUS_LABELS[status].toLowerCase()}.`}
          icon="✓"
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {state.reviews.map((review) => {
            const actions = MODERATION_ACTIONS_BY_STATUS[review.moderationStatus] || [];
            return (
              <div key={review.reviewId} className={formStyles.formCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <StarRating value={review.rating} />
                  <span style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <Badge tone={MODERATION_STATUS_TONE[review.moderationStatus] || "neutral"}>
                      {MODERATION_STATUS_LABELS[review.moderationStatus] || review.moderationStatus}
                    </Badge>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{formatDate(review.createdAt)}</span>
                  </span>
                </div>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                  Product #{review.productId} · Customer #{review.customerId} · Order #{review.orderId}
                </p>
                {review.reviewText ? <p style={{ marginBottom: "1rem" }}>{review.reviewText}</p> : null}
                {actions.length > 0 ? (
                  <div style={{ display: "flex", gap: "0.75rem" }}>
                    {actions.map((action) => (
                      <Button
                        key={action}
                        variant={ACTION_BUTTONS[action].variant}
                        loading={busyId === review.reviewId}
                        onClick={() => handleModerate(review, action)}
                      >
                        {ACTION_BUTTONS[action].label}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Removed reviews cannot be restored.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
