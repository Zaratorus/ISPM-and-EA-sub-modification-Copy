/**
 * courier-link.js
 * Signed courier links for the Delivery Person, who has no account
 * (project-owner decision, 2026-09-12). The token is an HMAC-SHA256 of the
 * delivery ID keyed with COURIER_LINK_SECRET, so it:
 *   - works for exactly one delivery (a token for delivery 1 fails on 2),
 *   - cannot be guessed or derived without the server-side secret,
 *   - needs no database storage (it is recomputed to verify).
 * The secret never leaves the backend; only the resulting token is shared.
 */

const crypto = require('crypto');
const config = require('../../config/env.config');

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/; // base64url of a 32-byte HMAC-SHA256

function createCourierToken(deliveryId) {
  return crypto
    .createHmac('sha256', config.courierLink.secret)
    .update(`courier-link:v1:${deliveryId}`)
    .digest('base64url');
}

// Compares the exact token strings in constant time. (Comparing decoded bytes
// would accept a token whose last character was altered only in its unused bits.)
function verifyCourierToken(deliveryId, token) {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return false;
  const given = Buffer.from(token, 'utf8');
  const expected = Buffer.from(createCourierToken(deliveryId), 'utf8');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

// What the Admin shares with the Delivery Person: the frontend page path with the token.
function courierLinkFor(deliveryId) {
  const courierToken = createCourierToken(deliveryId);
  return { courierToken, courierPath: `/delivery-tracking/${deliveryId}?token=${courierToken}` };
}

module.exports = { createCourierToken, verifyCourierToken, courierLinkFor };
