/**
 * auth-courier-link.middleware.js
 * Guards the Delivery Person routes (GET /deliveries/:id/courier and
 * PATCH /deliveries/:id/courier/status). The request must carry the signed
 * courier token for THIS delivery ID in the X-Courier-Token header — the
 * token from the courier link the Admin shares. Runs before validation, so
 * an unauthenticated caller learns nothing about which delivery IDs exist.
 *
 * The delivery ID must be in canonical form (no leading zeros, digits only),
 * so a token cannot be replayed against a disguised variant of the ID.
 */

const ApiError = require('../utils/ApiError');
const { verifyCourierToken } = require('../utils/courier-link');

const CANONICAL_ID = /^[1-9][0-9]{0,15}$/;

function authCourierLink(req, res, next) {
  const token = req.headers['x-courier-token'];
  if (!token) {
    return next(ApiError.unauthorized('COURIER_LINK_REQUIRED', 'A valid courier link is required to access this delivery.'));
  }
  const deliveryId = String(req.params.id);
  if (!CANONICAL_ID.test(deliveryId) || !verifyCourierToken(deliveryId, token)) {
    return next(ApiError.unauthorized('INVALID_COURIER_LINK', 'This courier link is not valid for this delivery.'));
  }
  return next();
}

module.exports = authCourierLink;
