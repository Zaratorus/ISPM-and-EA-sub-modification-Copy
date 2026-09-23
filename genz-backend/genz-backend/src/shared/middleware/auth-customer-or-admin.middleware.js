/**
 * auth-customer-or-admin.middleware.js
 * Accepts either a valid Customer JWT OR a valid Owner/Admin Access-Key
 * session, attaching whichever succeeded (req.customer or req.adminSession).
 * Used by endpoints documented as "Customer (own) / Admin (all)"
 * (Backend/API Architecture Design V1.0, Section 6 — e.g. GET /orders,
 * GET /orders/:id). Rejects with 401 only if neither token verifies.
 */

const jwt = require('jsonwebtoken');
const config = require('../../config/env.config');
const ApiError = require('../utils/ApiError');

function authCustomerOrAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return next(ApiError.unauthorized('AUTH_REQUIRED', 'Authentication is required for this action.'));
  }

  try {
    const adminPayload = jwt.verify(token, config.adminAccessKey.sessionJwtSecret, { algorithms: ['HS256'] });
    if (adminPayload.type === 'OWNER_ADMIN') {
      req.adminSession = { type: 'OWNER_ADMIN' };
      return next();
    }
  } catch (err) {
    // Not a valid admin session token — fall through and try customer.
  }

  try {
    const customerPayload = jwt.verify(token, config.customerAuth.jwtSecret, { algorithms: ['HS256'] });
    req.customer = { customerId: customerPayload.customerId };
    return next();
  } catch (err) {
    return next(ApiError.unauthorized('INVALID_TOKEN', 'Session is invalid or has expired.'));
  }
}

module.exports = authCustomerOrAdmin;
