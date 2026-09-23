/**
 * shopInfo.js — real shop details, filled in by the store owner.
 *
 * Every value here is intentionally EMPTY. Nothing in this file is invented:
 * the footer renders a block only when its values are supplied, so the live
 * site never shows a placeholder address, a fake policy or a dead link.
 *
 * To switch a section on, just fill in the strings below.
 *
 *   address       "No. 00, Example Street, Colombo"
 *   phone         "+94 XX XXX XXXX"          (tel: link)
 *   email         "hello@example.com"        (mailto: link)
 *   openingHours  "Mon–Sat, 9.00am – 7.00pm"
 *   deliveryNote  one short line about delivery areas or timescales
 *
 * `social` and `policies` take full URLs or in-app routes. Any entry left
 * empty is skipped.
 *
 * The WhatsApp number is NOT set here — it already comes from the backend's
 * store settings (GET /settings) and is managed in the admin panel.
 */

export const shopInfo = {
  address: "",
  phone: "",
  email: "",
  openingHours: "",
  deliveryNote: "",

  social: {
    facebook: "",
    instagram: "",
    tiktok: "",
  },

  policies: {
    delivery: "",
    returns: "",
    privacy: "",
    terms: "",
  },
};

/** True when at least one value in an object is a non-empty string. */
export function hasAny(obj) {
  return Object.values(obj || {}).some((v) => typeof v === "string" && v.trim() !== "");
}
