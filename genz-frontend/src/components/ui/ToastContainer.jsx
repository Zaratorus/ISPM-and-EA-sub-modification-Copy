import styles from "./ToastContainer.module.css";

const ICONS = { success: "✓", error: "!", info: "i" };

export default function ToastContainer({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return (
    <div className={styles.stack} role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`${styles.toast} ${styles[toast.type] || ""}`}>
          <span className={styles.icon} aria-hidden="true">
            {ICONS[toast.type] || ICONS.info}
          </span>
          <span className={styles.message}>{toast.message}</span>
          <button
            type="button"
            className={styles.close}
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
