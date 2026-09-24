import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useProductSearch } from "../hooks/useProductSearch";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import ProductGrid from "../components/product/ProductGrid";
import ShopFilterBar from "../components/product/ShopFilterBar";
import ErrorState from "../components/ui/ErrorState";
import Breadcrumb from "../components/ui/Breadcrumb";
import styles from "./ShopPage.module.css";

const LIMIT = 20;

export default function ShopPage({ fixedCategoryId, pageTitle }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => {
    const page = Number(searchParams.get("page")) || 1;
    return {
      categoryId: fixedCategoryId || (searchParams.get("categoryId") ? Number(searchParams.get("categoryId")) : undefined),
      name: searchParams.get("q") || undefined,
      brand: searchParams.get("brand") || undefined,
      variant: searchParams.get("variant") || undefined,
      minPrice: searchParams.get("minPrice") ? Number(searchParams.get("minPrice")) : undefined,
      maxPrice: searchParams.get("maxPrice") ? Number(searchParams.get("maxPrice")) : undefined,
      page,
      limit: LIMIT,
    };
  }, [searchParams, fixedCategoryId]);

  useDocumentTitle(pageTitle || (filters.name ? `Search: ${filters.name}` : "Shop"));

  const { products, meta, loading, error } = useProductSearch(filters);

  function updateFilters(next) {
    const params = new URLSearchParams();
    if (!fixedCategoryId && next.categoryId) params.set("categoryId", next.categoryId);
    if (next.name) params.set("q", next.name);
    if (next.brand) params.set("brand", next.brand);
    if (next.variant) params.set("variant", next.variant);
    if (next.minPrice) params.set("minPrice", next.minPrice);
    if (next.maxPrice) params.set("maxPrice", next.maxPrice);
    setSearchParams(params);
  }

  function goToPage(page) {
    const params = new URLSearchParams(searchParams);
    params.set("page", page);
    setSearchParams(params);
  }

  const totalPages = meta ? Math.max(1, Math.ceil(meta.total / meta.limit)) : 1;

  return (
    <div className={`${styles.page} container`}>
      <Breadcrumb
        items={[
          { label: "Home", to: "/" },
          fixedCategoryId ? { label: "Shop", to: "/shop" } : { label: "Shop" },
          fixedCategoryId ? { label: pageTitle || "Category" } : null,
        ]}
      />

      <div className={styles.header}>
        <h1>{pageTitle || "Shop the Collection"}</h1>
        {filters.name ? <p className={styles.resultsFor}>Results for &ldquo;{filters.name}&rdquo;</p> : null}
        {meta ? (
          <p className={styles.count}>
            {meta.total} product{meta.total === 1 ? "" : "s"}
          </p>
        ) : null}
      </div>

      <ShopFilterBar filters={filters} onChange={updateFilters} fixedCategoryId={fixedCategoryId} />

      <div>
        {loading ? (
          <ProductGrid loading skeletonCount={8} />
        ) : error ? (
          <ErrorState message={error.message} />
        ) : (
          <>
            <ProductGrid products={products} emptyMessage="Try adjusting your filters or search term." />
            {totalPages > 1 ? (
              <nav className={styles.pagination} aria-label="Pagination">
                <button disabled={filters.page <= 1} onClick={() => goToPage(filters.page - 1)}>
                  ← Prev
                </button>
                <span>
                  Page {filters.page} of {totalPages}
                </span>
                <button disabled={filters.page >= totalPages} onClick={() => goToPage(filters.page + 1)}>
                  Next →
                </button>
              </nav>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
