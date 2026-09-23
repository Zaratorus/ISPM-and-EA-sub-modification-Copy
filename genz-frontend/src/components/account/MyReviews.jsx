import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listMyReviews, updateMyReview, deleteMyReview } from "../../api/reviews";
import { toApiError } from "../../api/client";
import { useToast } from "../../context/ToastContext";
import StarRating from "../ui/StarRating";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import LoadingSpinner from "../ui/LoadingSpinner";
import { MODERATION_STATUS_LABELS, MODERATION_STATUS_TONE } from "../../utils/constants";
import { formatDate } from "../../utils/format";
import formStyles from "../forms/Form.module.css";
import styles from "./MyReviews.module.css";

/**
 * "My Reviews" on the Account page: the logged-in customer's own reviews
 * (GET /reviews/mine) with status, edit (rating + text) and delete.
 * Any edit sends the review back to moderation (backend rule).
 */
export default function MyReviews() {
  const { showToast } = useToast();
  const [state, setState] = useState({ reviews: [], loading: true, error: null });
  const [editingId, setEditingId] = useState(null);

  function load() {
    listMyReviews({ page: 1, limit: 100 })
      .then((res) => setState({ reviews: res.data, loading: false, error: null }))
      .catch((err) => setState({ reviews: [], loading: false, error: toApiError(err) }));
  }

  useEffect(load, []);

  async function handleDelete(review) {
    if (!window.confirm(`Delete your review of ${review.productName || "this product"}? This cannot be undone.`)) return;
    try {
      await deleteMyReview(review.reviewId);
      showToast("Review deleted.", "success");
      load();
    } catch (err) {
      showToast(toApiError(err).message, "error");
    }
  }

  return (
    <div className={styles.section}>
      <h2>My Reviews</h2>

      {state.loading ? (
        <LoadingSpinner label="Loading your reviews…" />
      ) : state.error ? (
        <p className={formStyles.error}>{state.error.message}</p>
      ) : state.reviews.length === 0 ? (
        <p className={styles.empty}>You haven't reviewed any products yet.</p>
      ) : (
        <ul className={styles.list}>
          {state.reviews.map((review) => (
            <li key={review.reviewId} className={styles.item}>
              <div className={styles.itemHeader}>
                <Link to={`/products/${review.productId}`} className={styles.product}>
                  {review.productName || `Product #${review.productId}`}
                </Link>
                <Badge tone={MODERATION_STATUS_TONE[review.status] || "neutral"}>
                  {MODERATION_STATUS_LABELS[review.status] || review.status}
                </Badge>
              </div>

              {editingId === review.reviewId ? (
                <ReviewEditor
                  review={review}
                  onCancel={() => setEditingId(null)}
                  onSaved={() => {
                    setEditingId(null);
                    load();
                  }}
                />
              ) : (
                <>
                  <div className={styles.meta}>
                    <StarRating value={review.rating} />
                    <span>{formatDate(review.createdAt)}</span>
                  </div>
                  {review.reviewText ? <p className={styles.text}>{review.reviewText}</p> : null}
                  {review.status === "REJECTED" ? (
                    <p className={styles.note}>This review was not approved. You can edit it and resubmit it for moderation.</p>
                  ) : null}
                  <div className={styles.actions}>
                    <Button variant="outline" onClick={() => setEditingId(review.reviewId)}>
                      Edit
                    </Button>
                    <Button variant="danger" onClick={() => handleDelete(review)}>
                      Delete
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewEditor({ review, onCancel, onSaved }) {
  const { showToast } = useToast();
  const [rating, setRating] = useState(review.rating);
  const [text, setText] = useState(review.reviewText || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateMyReview(review.reviewId, { rating, reviewText: text });
      showToast(
        review.status === "APPROVED"
          ? "Review updated — it will be public again once it has been re-approved."
          : "Review updated and sent for moderation.",
        "success"
      );
      onSaved();
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.editor} onSubmit={handleSubmit}>
      {review.status === "APPROVED" ? (
        <p className={styles.note}>
          Saving changes sends this review back to moderation. It will be hidden from the product page until it is
          approved again.
        </p>
      ) : null}
      <StarRating value={rating} onChange={setRating} size="lg" />
      <textarea
        className={formStyles.textarea}
        placeholder="Share your experience with this product (optional)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={2000}
      />
      {error ? <p className={formStyles.error}>{error}</p> : null}
      <div className={styles.actions}>
        <Button type="submit" loading={saving}>
          Save
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
