/**
 * variants.js — the two fixed chip sets rendered on PDP and the shop
 * filter bar's Size/Age pill, keyed by a category's `variantType`.
 * Mirrors the backend's src/shared/constants/variants.js — keep both in
 * sync. `NONE` categories (e.g. Perfumes) render no chip selector at all.
 */

export const SIZE_LABELS = ["S", "M", "L", "XL", "XXL"];
export const AGE_LABELS = ["5-6Y", "7-8Y", "9-10Y", "11-12Y", "13-14Y", "15-16Y"];

/** @returns {string[]} the chip set for a category's variantType ('SIZE' | 'AGE' | 'NONE' | undefined). */
export function labelsForVariantType(variantType) {
  if (variantType === "SIZE") return SIZE_LABELS;
  if (variantType === "AGE") return AGE_LABELS;
  return [];
}
