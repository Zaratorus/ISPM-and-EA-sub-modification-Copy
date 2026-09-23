import { forwardRef } from "react";
import { Link } from "react-router-dom";
import styles from "./Button.module.css";

/**
 * Renders a <button>, or a router <Link>/<a> when `to`/`href` is given —
 * one component, consistent styling everywhere a call-to-action appears.
 */
const Button = forwardRef(function Button(
  { variant = "primary", size = "md", to, href, loading = false, disabled, className = "", children, ...rest },
  ref
) {
  const classes = `${styles.btn} ${styles[variant] || ""} ${styles[size] || ""} ${className}`.trim();

  if (to) {
    return (
      <Link to={to} className={classes} ref={ref} {...rest}>
        {children}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} className={classes} ref={ref} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <button className={classes} disabled={disabled || loading} ref={ref} {...rest}>
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : null}
      <span className={loading ? styles.hiddenLabel : undefined}>{children}</span>
    </button>
  );
});

export default Button;
