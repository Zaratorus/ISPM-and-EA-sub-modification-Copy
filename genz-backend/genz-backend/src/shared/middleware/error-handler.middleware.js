/**
 * error-handler.middleware.js
 * Single global error handler, mounted last in the middleware chain
 * (see src/app.js). Converts ApiError instances (thrown by any service)
 * and unexpected errors into the consistent response envelope defined in
 * Backend/API Architecture Design V1.0, Section 9/10.
 */

const ApiError = require('../utils/ApiError');
const config = require('../../config/env.config');

// eslint-disable-next-line no-unused-vars
function errorHandlerMiddleware(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
  }

  // Request-body errors from express.json() (body-parser): unparseable JSON, or
  // a body over the parser's size limit. These are client errors, answered with
  // fixed messages — the parser's own message, the raw body and the stack are
  // never returned or logged.
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'Invalid JSON request body.' },
    });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' },
    });
  }

  // MySQL constraint violations that somehow bypassed application-level checks
  // (defense-in-depth per Backend/API Architecture Design V1.0, Section 11)
  if (err && err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      error: { code: 'DUPLICATE_ENTRY', message: 'A record with this value already exists.' },
    });
  }
  if (err && (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED')) {
    return res.status(409).json({
      error: { code: 'REFERENCED_ROW', message: 'This record cannot be modified because it is referenced elsewhere.' },
    });
  }
  if (err && err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
    return res.status(400).json({
      error: { code: 'CONSTRAINT_VIOLATED', message: 'The request violates a database constraint.' },
    });
  }

  // Unexpected error — never leak internals in production
  // eslint-disable-next-line no-console
  console.error('Unhandled error:', err);
  return res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: config.env === 'production' ? 'An unexpected error occurred.' : String(err && err.message),
    },
  });
}

module.exports = errorHandlerMiddleware;
