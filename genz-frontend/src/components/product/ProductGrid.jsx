import ProductCard from "./ProductCard";
import EmptyState from "../ui/EmptyState";
import styles from "./ProductGrid.module.css";

export default function ProductGrid({ products, emptyMessage = "No products found.", loading = false, skeletonCount = 8 }) {
  // Placeholder cards at the real card proportions: the grid keeps its shape
  // while data arrives, instead of collapsing and then reflowing.
  if (loading) {
    return (
      <div className={styles.grid} aria-busy="true" aria-live="polite">
        <span className="visually-hidden">Loading products…</span>
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <div key={i} className={styles.skeleton} aria-hidden="true">
            <div className={styles.skeletonImage} />
            <div className={styles.skeletonBody}>
              <div className={styles.skeletonLine} />
              <div className={`${styles.skeletonLine} ${styles.skeletonLineShort}`} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!products || products.length === 0) {
    return <EmptyState title="No products found" message={emptyMessage} icon="⬚" />;
  }

  return (
    <div className={styles.grid}>
      {products.map((product) => (
        <ProductCard key={product.product_id} product={product} />
      ))}
    </div>
  );
}
