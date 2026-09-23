/**
 * auth-customer.middleware.js
 * Validates a Customer JWT (issued at /auth/customer/login) and attaches
 * req.customer = { customerId }. Applied only to routes explicitly marked
 * "Customer" in Backend/API Architecture Design V1.0, Section 6 — never to
 * public browsing routes (DEC-02: login required at checkout, not browsing).
 */

const jwt = require('jsonwebtoken');
const config = require('../../config/env.config');
const ApiError = require('../utils/ApiError');

function authCustomer(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return next(ApiError.unauthorized('AUTH_REQUIRED', 'Customer authentication is required for this action.'));
  }

  try {
    const payload = jwt.verify(token, config.customerAuth.jwtSecret, { algorithms: ['HS256'] });
    req.customer = { customerId: payload.customerId };
    return next();
  } catch (err) {
    return next(ApiError.unauthorized('INVALID_TOKEN', 'Customer session is invalid or has expired.'));
  }
}

/**
 * Optional-auth variant: attaches req.customer if a valid token is present,
 * but does not reject the request otherwise. Reserved for endpoints whose
 * behaviour may one day depend on optional customer identity WITHOUT
 * requiring it — not currently used by any route in Section 6, but kept
 * available since the guest-cart-persistence decision (OPEN, Section 15
 * item 2) may need it once resolved.
 */
function authCustomerOptional(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, config.customerAuth.jwtSecret, { algorithms: ['HS256'] });
    req.customer = { customerId: payload.customerId };
  } catch (err) {
    // ignore invalid token in the optional path
  }
  return next();
}

module.exports = { authCustomer, authCustomerOptional };
