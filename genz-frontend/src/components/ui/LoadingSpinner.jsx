import styles from "./LoadingSpinner.module.css";

export default function LoadingSpinner({ label = "Loading…", size = "md", fullPage = false }) {
  const content = (
    <div className={`${styles.wrap} ${styles[size] || ""}`} role="status" aria-live="polite">
      <span className={styles.ring} aria-hidden="true" />
      <span className={styles.label}>{label}</span>
    </div>
  );
  if (fullPage) return <div className={styles.fullPage}>{content}</div>;
  return content;
}
