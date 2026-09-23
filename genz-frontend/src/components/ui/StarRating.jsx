import styles from "./StarRating.module.css";

/**
 * Displays a 1–5 star rating. When `onChange` is given it becomes an
 * interactive input (used by the review form); otherwise it's read-only
 * display (product cards, review lists).
 */
export default function StarRating({ value = 0, onChange, size = "md" }) {
  const stars = [1, 2, 3, 4, 5];
  const interactive = typeof onChange === "function";
  const rounded = Math.round(Number(value) || 0);

  if (!interactive) {
    return (
      <div className={`${styles.row} ${styles[size]}`} aria-label={`Rated ${value} out of 5`}>
        {stars.map((n) => (
          <span key={n} className={n <= rounded ? styles.filled : styles.empty} aria-hidden="true">
            ★
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className={`${styles.row} ${styles[size]} ${styles.interactive}`} role="radiogroup" aria-label="Rating">
      {stars.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={n === rounded}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          className={n <= rounded ? styles.filled : styles.empty}
          onClick={() => onChange(n)}
        >
          ★
        </button>
      ))}
    </div>
  );
}
