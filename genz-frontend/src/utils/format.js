// Physical Schema Design V1.0, Section 4: monetary values are DECIMAL(10,2)
// stored/transmitted as strings (mysql2 decimalNumbers: false) — always
// coerce with Number() before formatting or doing arithmetic.

const currencyFormatter = new Intl.NumberFormat("en-LK", {
  style: "currency",
  currency: "LKR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return currencyFormatter.format(n);
}

export function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-LK", { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-LK", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Resolves a product_images.image_reference (an R2 object key, or
 * sometimes a full URL) into a displayable <img> src. Returns null when
 * nothing usable is available so callers can render a styled placeholder
 * instead of a broken image.
 */
export function resolveImageUrl(imageReference) {
  if (!imageReference) return null;
  if (/^https?:\/\//i.test(imageReference)) return imageReference;
  const base = import.meta.env.VITE_R2_PUBLIC_BASE_URL;
  if (base) return `${base.replace(/\/$/, "")}/${imageReference.replace(/^\//, "")}`;
  return null;
}

export function titleCase(value) {
  if (!value) return "";
  return value
    .toLowerCase()
    .split(/[\s_-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
