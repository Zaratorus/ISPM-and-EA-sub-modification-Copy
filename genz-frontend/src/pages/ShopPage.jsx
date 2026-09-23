import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useProductSearch } from "../hooks/useProductSearch";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import ProductGrid from "../components/product/ProductGrid";
import ProductFilters from "../components/product/ProductFilters";
import ErrorState from "../components/ui/ErrorState";
import Breadcrumb from "../components/ui/Breadcrumb";
import styles from "./ShopPage.module.css";

const LIMIT = 20;

export default function ShopPage({ fixedCategoryId, pageTitle }) {
  const [searchParams, setSearchParams] = useSearchParams();
  // Mobile only: the filter panel becomes a bottom sheet so products are
  // visible immediately. Desktop keeps the sticky sidebar. There is still a
  // single ProductFilters instance — only its presentation changes.
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Focus management for the mobile filter dialog.
  const filterTriggerRef = useRef(null);
  const sheetRef = useRef(null);
  const sheetCloseRef = useRef(null);

  const filters = useMemo(() => {
    const page = Number(searchParams.get("page")) || 1;
    return {
      categoryId: fixedCategoryId || (searchParams.get("categoryId") ? Number(searchParams.get("categoryId")) : undefined),
      name: searchParams.get("q") || undefined,
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

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (!fixedCategoryId && filters.categoryId) n += 1;
    if (filters.minPrice) n += 1;
    if (filters.maxPrice) n += 1;
    return n;
  }, [filters, fixedCategoryId]);

  // Stop the page behind the sheet from scrolling while it is open.
  useEffect(() => {
    if (!filtersOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [filtersOpen]);

  // Focus management for the filter dialog: move focus in on open, keep Tab
  // and Shift+Tab inside while it is open, close on Escape, and return focus
  // to the trigger on close — whichever route closed it (Close, Escape,
  // Apply or backdrop), because they all flip `filtersOpen` to false and so
  // all run this effect's cleanup.
  useEffect(() => {
    if (!filtersOpen) return undefined;

    // Captured now rather than read in cleanup: the element that opened the
    // dialog is the one focus must return to.
    const trigger = filterTriggerRef.current;

    const FOCUSABLE =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const getFocusable = () => {
      const sheet = sheetRef.current;
      if (!sheet) return [];
      return Array.from(sheet.querySelectorAll(FOCUSABLE)).filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 || rect.height > 0;
      });
    };

    // Move focus into the dialog, preferring its Close button.
    sheetCloseRef.current?.focus();

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setFiltersOpen(false);
        return;
      }
      if (e.key !== "Tab") return;

      const sheet = sheetRef.current;
      const focusable = getFocusable();
      if (!sheet || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const outside = !sheet.contains(active);

      if (e.shiftKey) {
        if (active === first || outside) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || outside) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [filtersOpen]);

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

      <div className={styles.toolbar}>
        <button
          type="button"
          ref={filterTriggerRef}
          className={styles.filterToggle}
          onClick={() => setFiltersOpen(true)}
          aria-expanded={filtersOpen}
          aria-controls="shop-filters"
        >
          <FilterIcon />
          Filter
          {activeFilterCount > 0 ? <span className={styles.filterCount}>{activeFilterCount}</span> : null}
        </button>
      </div>

      <div className={styles.layout}>
        {/* Desktop: persistent sidebar. Hidden below 900px by CSS. */}
        <aside className={styles.sidebar} aria-label="Product filters">
          <ProductFilters filters={filters} onChange={updateFilters} />
        </aside>

        {/* Mobile: the same controls in a bottom sheet, mounted only while
            open — the pattern the navbar drawer already uses. Both instances
            are fully controlled by `filters`/`updateFilters`, so they cannot
            hold different state. */}
        {filtersOpen ? (
          <>
            <div className={styles.backdrop} onClick={() => setFiltersOpen(false)} aria-hidden="true" />
            <div
              id="shop-filters"
              ref={sheetRef}
              className={styles.sheet}
              role="dialog"
              aria-modal="true"
              aria-label="Product filters"
            >
              <button
                type="button"
                ref={sheetCloseRef}
                className={styles.sheetClose}
                onClick={() => setFiltersOpen(false)}
                aria-label="Close filters"
              >
                &times;
              </button>

              <ProductFilters filters={filters} onChange={updateFilters} />

              <div className={styles.sheetFooter}>
                <button type="button" className={styles.sheetApply} onClick={() => setFiltersOpen(false)}>
                  {meta ? `Show ${meta.total} product${meta.total === 1 ? "" : "s"}` : "Show products"}
                </button>
              </div>
            </div>
          </>
        ) : null}

        <div className={styles.results}>
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
    </div>
  );
}

function FilterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 5h18M6 12h12M10 19h4" strokeLinecap="round" />
    </svg>
  );
}
