import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCategories } from "../../hooks/useCategories";
import { useProductSearch } from "../../hooks/useProductSearch";
import { formatCurrency } from "../../utils/format";
import ProductImage from "../ui/ProductImage";
import styles from "./SearchOverlay.module.css";

const RESULTS_LIMIT = 8;

/**
 * Full-panel search overlay opened from the header's search icon. Shows
 * live product results (thumbnail grid) once the visitor types, and a
 * "Trending Now" listing plus category shortcuts before they do.
 */
export default function SearchOverlay({ onClose }) {
  const [term, setTerm] = useState("");
  const navigate = useNavigate();
  const { categories } = useCategories();
  const { products, loading } = useProductSearch(
    term.trim() ? { name: term.trim(), limit: RESULTS_LIMIT } : { limit: RESULTS_LIMIT }
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  function handleSubmit(e) {
    e.preventDefault();
    const q = term.trim();
    navigate(q ? `/shop?q=${encodeURIComponent(q)}` : "/shop");
    onClose();
  }

  function goTo(path) {
    navigate(path);
    onClose();
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Search">
      <button type="button" className={styles.backdrop} aria-label="Close search" onClick={onClose} />

      <div className={styles.panel}>
        <div className="container">
          <div className={styles.topRow}>
            <span className={styles.kicker}>Search</span>
            <button type="button" className={styles.closeBtn} aria-label="Close search" onClick={onClose}>
              <CloseIcon />
            </button>
          </div>

          <form className={styles.searchForm} onSubmit={handleSubmit} role="search">
            <SearchIcon />
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search articles, pages, or products"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              autoFocus
              aria-label="Search articles, pages, or products"
            />
          </form>

          {categories.length ? (
            <div className={styles.categoryRow}>
              <span className={styles.categoryLabel}>Shop by category</span>
              {categories.map((cat) => (
                <button
                  key={cat.categoryId}
                  type="button"
                  className={styles.categoryChip}
                  onClick={() => goTo(`/category/${cat.categoryId}`)}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          ) : null}

          <div className={styles.resultsSection}>
            <h3 className={styles.resultsHeading}>{term.trim() ? "Results" : "Trending Now"}</h3>

            {!loading && products.length === 0 ? (
              <p className={styles.emptyState}>No products found for &ldquo;{term.trim()}&rdquo;.</p>
            ) : (
              <div className={styles.resultsGrid}>
                {(loading ? Array.from({ length: 4 }) : products).map((product, i) =>
                  product ? (
                    <button
                      key={product.product_id}
                      type="button"
                      className={styles.resultCard}
                      onClick={() => goTo(`/products/${product.product_id}`)}
                    >
                      <span className={styles.resultImage}>
                        <ProductImage imageReference={product.images?.[0]?.image_reference} alt={product.name} />
                      </span>
                      <span className={styles.resultName}>{product.name}</span>
                      <span className={styles.resultPrice}>{formatCurrency(product.price)}</span>
                    </button>
                  ) : (
                    <span key={i} className={styles.resultSkeleton} aria-hidden="true" />
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M5 5l14 14M19 5L5 19" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}
