/**
 * auth-admin-access-key.middleware.js
 * Validates the session token issued after a successful Owner/Admin
 * Access Key submission (POST /admin/access-key/validate). Attaches
 * req.adminSession = { type: 'OWNER_ADMIN' }.
 *
 * This middleware NEVER validates a username/password — that flow does not
 * exist, per the locked Admin Access Key requirement. It only validates the
 * session token produced AFTER a successful key check, which happens in
 * admin-access-key.service.js (store-administration module).
 *
 * OPEN (Backend/API Architecture Design V1.0, Section 15 item 7):
 * the exact key-hashing/validation algorithm used when the key was first
 * submitted is not decided here — this middleware only concerns the
 * session token that follows a successful validation.
 */

const jwt = require('jsonwebtoken');
const config = require('../../config/env.config');
const ApiError = require('../utils/ApiError');

function authAdminAccessKey(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return next(ApiError.unauthorized('AUTH_REQUIRED', 'Admin authentication is required for this action.'));
  }

  try {
    const payload = jwt.verify(token, config.adminAccessKey.sessionJwtSecret, { algorithms: ['HS256'] });
    if (payload.type !== 'OWNER_ADMIN') {
      throw new Error('unexpected token type');
    }
    req.adminSession = { type: 'OWNER_ADMIN' };
    return next();
  } catch (err) {
    return next(ApiError.unauthorized('INVALID_TOKEN', 'Admin session is invalid or has expired.'));
  }
}

/**
 * Optional-auth variant — same validation logic as authAdminAccessKey
 * (no redesign of the Access Key mechanism), but never rejects the
 * request: attaches req.adminSession if a valid token is present,
 * otherwise proceeds without it. Mirrors auth-customer.middleware.js's
 * authCustomerOptional precedent. Needed for GET /settings's documented
 * hybrid contract (Backend/API Architecture Design V1.0, Section 6:
 * "Public (WhatsApp number only) / Admin (full)").
 *
 * Attached as a property on the default export (not a separate named
 * export) so every existing `const authAdminAccessKey = require(...)`
 * caller keeps working unchanged.
 */
function authAdminAccessKeyOptional(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, config.adminAccessKey.sessionJwtSecret, { algorithms: ['HS256'] });
    if (payload.type === 'OWNER_ADMIN') {
      req.adminSession = { type: 'OWNER_ADMIN' };
    }
  } catch (err) {
    // ignore invalid token in the optional path
  }
  return next();
}

authAdminAccessKey.optional = authAdminAccessKeyOptional;

module.exports = authAdminAccessKey;
