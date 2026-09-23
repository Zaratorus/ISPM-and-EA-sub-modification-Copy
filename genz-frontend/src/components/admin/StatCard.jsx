import styles from "./StatCard.module.css";

export default function StatCard({ label, value, hint }) {
  return (
    <div className={styles.card}>
      <p className={styles.label}>{label}</p>
      <p className={styles.value}>{value}</p>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  );
}
