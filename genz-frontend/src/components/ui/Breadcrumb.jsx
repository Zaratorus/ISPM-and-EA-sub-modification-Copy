import { Link } from "react-router-dom";
import styles from "./Breadcrumb.module.css";

/**
 * Shared breadcrumb, extracted from the product details page so shop and
 * category listings can use the identical treatment.
 *
 * `items` is an ordered array of { label, to }. The final item is rendered
 * as plain text (the current page) whether or not it carries a `to`.
 */
export default function Breadcrumb({ items = [] }) {
  const visible = items.filter(Boolean);
  if (visible.length === 0) return null;

  return (
    <nav className={styles.breadcrumb} aria-label="Breadcrumb">
      {visible.map((item, i) => {
        const isLast = i === visible.length - 1;
        return (
          <span key={`${item.label}-${i}`}>
            {i > 0 ? <span className={styles.sep}> / </span> : null}
            {isLast || !item.to ? (
              <span aria-current={isLast ? "page" : undefined}>{item.label}</span>
            ) : (
              <Link to={item.to}>{item.label}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
