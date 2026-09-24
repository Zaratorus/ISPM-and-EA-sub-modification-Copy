/**
 * variants.js
 * The two fixed chip sets rendered on PDP / the shop filter bar's
 * Size/Age pill, keyed by categories.variant_type. Mirrored on the
 * frontend at src/config/variants.js — keep both in sync.
 */

const SIZE_LABELS = ['S', 'M', 'L', 'XL', 'XXL'];
const AGE_LABELS = ['5-6Y', '7-8Y', '9-10Y', '11-12Y', '13-14Y', '15-16Y'];

/** @returns {'SIZE'|'AGE'|null} which set `label` belongs to, or null if neither. */
function variantTypeOfLabel(label) {
  if (SIZE_LABELS.includes(label)) return 'SIZE';
  if (AGE_LABELS.includes(label)) return 'AGE';
  return null;
}

module.exports = { SIZE_LABELS, AGE_LABELS, variantTypeOfLabel };
