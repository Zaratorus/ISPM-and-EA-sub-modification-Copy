import styles from "./StatePanel.module.css";
import Button from "./Button";

export default function ErrorState({
  title = "Unable to load this page",
  message = "Please try again.",
  onRetry,
}) {
  return (
    <div className={`${styles.panel} ${styles.errorPanel}`} role="alert">
      <div className={styles.icon} aria-hidden="true">
        !
      </div>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.message}>{message}</p>
      {onRetry ? (
        <div className={styles.action}>
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}
