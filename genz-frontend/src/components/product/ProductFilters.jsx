import { useCategories } from "../../hooks/useCategories";
import formStyles from "../forms/Form.module.css";
import styles from "./ProductFilters.module.css";

/**
 * Only exposes filters GET /products actually supports (Backend/API
 * Architecture Design V1.0, Section 6: categoryId, name, minPrice,
 * maxPrice) — no size/color/availability filter, since the schema has no
 * such fields on `products`.
 */
export default function ProductFilters({ filters, onChange }) {
  const { categories } = useCategories();

  const hasActiveFilters = Boolean(filters.categoryId || filters.minPrice || filters.maxPrice || filters.name);

  function update(patch) {
    onChange({ ...filters, ...patch });
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h3 className={styles.heading}>
          <SlidersIcon />
          Filter by
        </h3>
        {hasActiveFilters ? (
          <button type="button" className={styles.clear} onClick={() => onChange({ page: 1, limit: filters.limit })}>
            Clear filters
          </button>
        ) : null}
      </div>

      <div className={styles.group}>
        <p className={styles.groupLabel}>Category</p>
        <div className={styles.chipRow}>
          <button
            type="button"
            className={`${styles.chip} ${!filters.categoryId ? styles.chipActive : ""}`}
            onClick={() => update({ categoryId: undefined })}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.categoryId}
              type="button"
              className={`${styles.chip} ${Number(filters.categoryId) === cat.categoryId ? styles.chipActive : ""}`}
              onClick={() => update({ categoryId: cat.categoryId })}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.group}>
        <p className={styles.groupLabel}>Price Range (LKR)</p>
        <div className={styles.priceRow}>
          {/* A placeholder is not an accessible name, so each input carries an
              explicit aria-label. Visible UI is unchanged. */}
          <input
            type="number"
            min="0"
            className={formStyles.input}
            placeholder="Min"
            aria-label="Minimum price (LKR)"
            value={filters.minPrice ?? ""}
            onChange={(e) => update({ minPrice: e.target.value ? Number(e.target.value) : undefined })}
          />
          <span aria-hidden="true">–</span>
          <input
            type="number"
            min="0"
            className={formStyles.input}
            placeholder="Max"
            aria-label="Maximum price (LKR)"
            value={filters.maxPrice ?? ""}
            onChange={(e) => update({ maxPrice: e.target.value ? Number(e.target.value) : undefined })}
          />
        </div>
      </div>

    </div>
  );
}

function SlidersIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h10M18 18h2" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="16" cy="18" r="2" />
    </svg>
  );
}
