import { useId } from "react";
import styles from "./Form.module.css";

/**
 * Generic labeled field wrapper. Pass any input/select/textarea as
 * `children`, cloning the id/aria attributes in — used across every form
 * in the app (auth, checkout, admin CRUD) instead of repeating markup.
 */
export default function FormField({ label, error, hint, required, children, htmlFor }) {
  const autoId = useId();
  const id = htmlFor || autoId;

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label} {required ? <span className={styles.required}>*</span> : null}
      </label>
      {typeof children === "function" ? children(id) : children}
      {hint && !error ? <p className={styles.hint}>{hint}</p> : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
