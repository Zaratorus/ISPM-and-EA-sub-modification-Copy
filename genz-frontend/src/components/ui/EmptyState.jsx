import styles from "./StatePanel.module.css";

export default function EmptyState({ title = "Nothing here yet", message, icon = "◇", action }) {
  return (
    <div className={styles.panel}>
      <div className={styles.icon} aria-hidden="true">
        {icon}
      </div>
      <h3 className={styles.title}>{title}</h3>
      {message ? <p className={styles.message}>{message}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
