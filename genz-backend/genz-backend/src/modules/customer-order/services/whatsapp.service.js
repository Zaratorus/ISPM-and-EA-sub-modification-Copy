/**
 * whatsapp.service.js
 * Generates the pre-filled WhatsApp checkout message/link for a newly
 * created Order (Backend/API Architecture Design V1.0, Section 4 — this
 * file's documented placement; "WhatsApp checkout message generation").
 *
 * OPEN (Backend/API Architecture Design V1.0, Section 15 item 3): whether
 * this becomes a simple client-side wa.me link or a formal WhatsApp
 * Business API integration is not decided by any approved document. This
 * implementation builds a wa.me deep link — the option that requires no
 * external API credentials, webhook handling, or server-side network call,
 * making it the natural non-committal default (the .env.example variable
 * STORE_WHATSAPP_NUMBER was already introduced in this codebase, before
 * this change, specifically anticipating this path). Swapping to a formal
 * Business API integration later only requires changing this file's
 * internals — Order.whatsapp_checkout_reference stays a plain string
 * either way, and no endpoint contract changes.
 *
 * Interim source of the store's WhatsApp number: `config.whatsapp.storeNumber`
 * (env var). The canonical source is documented as Store Settings
 * (Logical Database Design V1.1, Section D4: "Referenced (read) by Module B
 * for the WhatsApp number used at checkout"), but Module D's Store Settings
 * read path is not yet built (see README "Next Steps"). Switch this to read
 * store_settings.whatsapp_number once that exists — out of scope for this
 * change, to avoid reaching into Module D's ownership prematurely.
 */

const config = require('../../../config/env.config');

/**
 * @param {{ items: { productName: string, quantity: number }[] }} order
 * @returns {{ text: string, link: string|null }}
 */
function buildCheckoutMessage(order) {
  const lines = order.items.map((item) => `${item.quantity} x ${item.productName}`);
  const text = `New order from the Gen-Z storefront:\n${lines.join('\n')}`;

  const storeNumber = (config.whatsapp.storeNumber || '').replace(/[^\d]/g, '');
  const link = storeNumber ? `https://wa.me/${storeNumber}?text=${encodeURIComponent(text)}` : null;

  return { text, link };
}

module.exports = { buildCheckoutMessage };
