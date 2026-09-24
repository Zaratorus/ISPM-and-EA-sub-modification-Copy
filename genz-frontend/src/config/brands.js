/**
 * brands.js — the storefront's brand taxonomy.
 *
 * There is no `brands` table/endpoint (Physical Schema Design keeps `brand`
 * as a free-text column on `products`, not a separate owned entity — see
 * db/schema.sql). This curated list is what "Shop by Brand" and the shop
 * filter panel render as options; `?brand=` on GET /products does an exact
 * match against these same strings, so the values here ARE the contract —
 * keep them in sync with whatever products are actually tagged with a
 * brand (scripts/seed-demo-products.js, scripts/add-brand-column-and-backfill.js).
 */

export const CLOTHING_BRANDS = [
  "Calvin Klein",
  "Crocodile",
  "Carnage",
  "Polo",
  "Nike",
  "Adidas",
  "H&M",
  "Zara",
  "Reebok",
  "Levi's",
];

export const FRAGRANCE_BRANDS = [
  "Denver",
  "Wild Stone",
  "Park Avenue",
  "Axe",
  "Adidas",
  "Nivea",
  "Engage",
  "Yardley",
  "Cobra",
];

/** Both groups, de-duplicated (Adidas makes both clothing and fragrance) — for flat single-list UI. */
export const ALL_BRANDS = [...new Set([...CLOTHING_BRANDS, ...FRAGRANCE_BRANDS])];
