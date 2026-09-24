import { useEffect, useState } from "react";
import { useCategories } from "../../hooks/useCategories";
import { CLOTHING_BRANDS, FRAGRANCE_BRANDS } from "../../config/brands";
import { SIZE_LABELS, AGE_LABELS } from "../../config/variants";
import FilterPopover from "./FilterPopover";
import styles from "./ShopFilterBar.module.css";

/**
 * Horizontal top filter bar — replaces the old sidebar/bottom-sheet
 * ProductFilters. Only exposes filters GET /products actually supports
 * (Backend/API Architecture Design V1.0, Section 6 + the brand/variant
 * additions): categoryId, name, brand, variant, minPrice, maxPrice.
 */
export default function ShopFilterBar({ filters, onChange, fixedCategoryId }) {
  const { categories } = useCategories();
  const [openPopover, setOpenPopover] = useState(null);
  const [priceDraft, setPriceDraft] = useState({ minPrice: filters.minPrice, maxPrice: filters.maxPrice });

  // Keep the draft in sync when filters change from outside this bar (e.g.
  // "Clear all", or the browser back/forward button changing the URL).
  useEffect(() => {
    setPriceDraft({ minPrice: filters.minPrice, maxPrice: filters.maxPrice });
  }, [filters.minPrice, filters.maxPrice]);

  const hasActiveFilters = Boolean(
    filters.categoryId || filters.brand || filters.variant || filters.minPrice || filters.maxPrice || filters.name
  );

  function update(patch) {
    onChange({ ...filters, ...patch });
  }

  function selectAndClose(patch) {
    update(patch);
    setOpenPopover(null);
  }

  const selectedCategory = categories.find((c) => c.categoryId === Number(filters.categoryId));
  const categoryVariantType = selectedCategory?.variantType;

  // Contextual filtering: once a category is selected, the Brand and
  // Size/Age filters only offer what actually applies to it — Perfumes
  // (variantType NONE) is unsized and fragrance-only; SIZE/AGE clothing
  // categories are clothing-brand-only. With no category selected (plain
  // /shop), every option stays available.
  const showClothingBrands = !selectedCategory || categoryVariantType !== "NONE";
  const showFragranceBrands = !selectedCategory || categoryVariantType === "NONE";
  const showSizeAgeFilter = categoryVariantType !== "NONE";
  const showSizes = !selectedCategory || categoryVariantType === "SIZE";
  const showAges = !selectedCategory || categoryVariantType === "AGE";

  // If switching category makes the current brand/variant selection
  // inapplicable (e.g. a Fragrance brand while viewing Men's Clothing, or
  // any Size/Age chip while viewing Perfumes), drop it rather than leave a
  // filter active that can only ever return zero results.
  useEffect(() => {
    if (!selectedCategory) return;
    const patch = {};
    if (filters.brand) {
      const allowed = categoryVariantType === "NONE"
        ? FRAGRANCE_BRANDS.includes(filters.brand)
        : CLOTHING_BRANDS.includes(filters.brand);
      if (!allowed) patch.brand = undefined;
    }
    if (filters.variant) {
      const allowedLabels = categoryVariantType === "SIZE" ? SIZE_LABELS : categoryVariantType === "AGE" ? AGE_LABELS : [];
      if (!allowedLabels.includes(filters.variant)) patch.variant = undefined;
    }
    if (Object.keys(patch).length > 0) update(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory?.categoryId, categoryVariantType, filters.brand, filters.variant]);

  const priceLabel =
    filters.minPrice || filters.maxPrice
      ? `Price: ${filters.minPrice ?? "0"}–${filters.maxPrice ?? "∞"}`
      : "Price Range";

  return (
    <div className={styles.bar}>
      <div className={styles.pills}>
        {!fixedCategoryId ? (
          <FilterPopover
            label={selectedCategory ? selectedCategory.name : "Category"}
            active={Boolean(selectedCategory)}
            open={openPopover === "category"}
            onOpenChange={(v) => setOpenPopover(v ? "category" : null)}
          >
            <div className={styles.chipRow}>
              <button
                type="button"
                className={`${styles.chip} ${!filters.categoryId ? styles.chipActive : ""}`}
                onClick={() => selectAndClose({ categoryId: undefined })}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.categoryId}
                  type="button"
                  className={`${styles.chip} ${Number(filters.categoryId) === cat.categoryId ? styles.chipActive : ""}`}
                  onClick={() => selectAndClose({ categoryId: cat.categoryId })}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </FilterPopover>
        ) : null}

        <FilterPopover
          label={filters.brand || "Brand"}
          active={Boolean(filters.brand)}
          open={openPopover === "brand"}
          onOpenChange={(v) => setOpenPopover(v ? "brand" : null)}
        >
          <button
            type="button"
            className={`${styles.chip} ${!filters.brand ? styles.chipActive : ""} ${styles.blockChip}`}
            onClick={() => selectAndClose({ brand: undefined })}
          >
            All Brands
          </button>
          {showClothingBrands ? (
            <>
              <p className={styles.subLabel}>Clothing</p>
              <div className={styles.chipRow}>
                {CLOTHING_BRANDS.map((brand) => (
                  <button
                    key={brand}
                    type="button"
                    className={`${styles.chip} ${filters.brand === brand ? styles.chipActive : ""}`}
                    onClick={() => selectAndClose({ brand })}
                  >
                    {brand}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          {showFragranceBrands ? (
            <>
              <p className={styles.subLabel}>Fragrance</p>
              <div className={styles.chipRow}>
                {FRAGRANCE_BRANDS.map((brand) => (
                  <button
                    key={brand}
                    type="button"
                    className={`${styles.chip} ${filters.brand === brand ? styles.chipActive : ""}`}
                    onClick={() => selectAndClose({ brand })}
                  >
                    {brand}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </FilterPopover>

        {showSizeAgeFilter ? (
          <FilterPopover
            label={filters.variant || "Size / Age"}
            active={Boolean(filters.variant)}
            open={openPopover === "variant"}
            onOpenChange={(v) => setOpenPopover(v ? "variant" : null)}
          >
            <button
              type="button"
              className={`${styles.chip} ${!filters.variant ? styles.chipActive : ""} ${styles.blockChip}`}
              onClick={() => selectAndClose({ variant: undefined })}
            >
              Any Size / Age
            </button>
            {showSizes ? (
              <>
                <p className={styles.subLabel}>Sizes</p>
                <div className={styles.chipRow}>
                  {SIZE_LABELS.map((label) => (
                    <button
                      key={label}
                      type="button"
                      className={`${styles.chip} ${filters.variant === label ? styles.chipActive : ""}`}
                      onClick={() => selectAndClose({ variant: label })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
            {showAges ? (
              <>
                <p className={styles.subLabel}>Ages</p>
                <div className={styles.chipRow}>
                  {AGE_LABELS.map((label) => (
                    <button
                      key={label}
                      type="button"
                      className={`${styles.chip} ${filters.variant === label ? styles.chipActive : ""}`}
                      onClick={() => selectAndClose({ variant: label })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </FilterPopover>
        ) : null}

        <FilterPopover
          label={priceLabel}
          active={Boolean(filters.minPrice || filters.maxPrice)}
          open={openPopover === "price"}
          onOpenChange={(v) => setOpenPopover(v ? "price" : null)}
        >
          <p className={styles.subLabel}>Price Range (LKR)</p>
          <div className={styles.priceRow}>
            <input
              type="number"
              min="0"
              className={styles.priceInput}
              placeholder="Min"
              aria-label="Minimum price (LKR)"
              value={priceDraft.minPrice ?? ""}
              onChange={(e) =>
                setPriceDraft((d) => ({ ...d, minPrice: e.target.value ? Number(e.target.value) : undefined }))
              }
            />
            <span aria-hidden="true">–</span>
            <input
              type="number"
              min="0"
              className={styles.priceInput}
              placeholder="Max"
              aria-label="Maximum price (LKR)"
              value={priceDraft.maxPrice ?? ""}
              onChange={(e) =>
                setPriceDraft((d) => ({ ...d, maxPrice: e.target.value ? Number(e.target.value) : undefined }))
              }
            />
          </div>
          <button
            type="button"
            className={styles.applyBtn}
            onClick={() => selectAndClose({ minPrice: priceDraft.minPrice, maxPrice: priceDraft.maxPrice })}
          >
            Apply
          </button>
        </FilterPopover>

        {hasActiveFilters ? (
          <button
            type="button"
            className={styles.clearAll}
            onClick={() => onChange({ page: 1, limit: filters.limit, categoryId: fixedCategoryId || undefined })}
          >
            Clear all
          </button>
        ) : null}
      </div>
    </div>
  );
}
