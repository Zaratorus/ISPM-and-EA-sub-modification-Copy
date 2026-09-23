import StarRating from "../ui/StarRating";
import { formatDate } from "../../utils/format";
import styles from "./ReviewCard.module.css";

// The review DTO carries no reviewer name (reviews table has no join to
// customers in review.service.js's toReviewDTO) — "Verified Customer" is
// used rather than inventing a name field the backend doesn't return.
export default function ReviewCard({ review }) {
  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <StarRating value={review.rating} />
        <span className={styles.date}>{formatDate(review.createdAt)}</span>
      </div>
      <p className={styles.reviewer}>Verified Customer</p>
      {review.reviewText ? <p className={styles.text}>{review.reviewText}</p> : null}
    </article>
  );
}
