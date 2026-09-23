import { DELIVERY_STATUS_LABELS } from "../../utils/constants";
import { formatDateTime } from "../../utils/format";
import styles from "./DeliveryProgress.module.css";

const STAGES = ["ASSIGNED", "HEADING_TO_STORE", "PICKED_UP", "OUT_FOR_DELIVERY", "ARRIVED", "DELIVERED"];

/**
 * Shared 6-stage delivery progress ladder — "what happened through the
 * process," visible identically to the Delivery Person (/delivery-tracking),
 * the Customer (their order page), and Admin (read-only, via the now-Admin-
 * accessible GET /orders/:id/delivery) (project-owner decision, 2026-09-12).
 *
 * Completed stages get a ✓ tick; the current stage is highlighted; future
 * stages stay dim. `history` (optional) is the delivery's
 * delivery_status_history, used to show a timestamp under each completed
 * stage when available.
 */
export default function DeliveryProgress({ status, history = [] }) {
  const currentIndex = STAGES.indexOf(status);

  const timestampFor = (stage) => {
    const entry = history.find((h) => h.toStatus === stage);
    return entry ? entry.changedAt : null;
  };

  return (
    <ol className={styles.progress}>
      {STAGES.map((stage, i) => {
        const done = i <= currentIndex;
        const current = i === currentIndex;
        const ts = timestampFor(stage);
        return (
          <li
            key={stage}
            className={`${styles.stage} ${done ? styles.stageDone : ""} ${current ? styles.stageCurrent : ""}`}
          >
            <span className={styles.stageDot} aria-hidden="true">
              {done ? "✓" : ""}
            </span>
            <span className={styles.stageText}>
              <span className={styles.stageLabel}>{DELIVERY_STATUS_LABELS[stage] || stage}</span>
              {ts ? <span className={styles.stageTime}>{formatDateTime(ts)}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
