/**
 * request-validator.middleware.js
 * Generic validator-middleware factory. Each route declares a zod schema
 * (in its module's validators/ folder) describing the shape of req.body,
 * req.query, and/or req.params; this factory runs it before the controller,
 * per Backend/API Architecture Design V1.0, Section 11.
 *
 * This is the FIRST line of defense only — it catches malformed input early
 * for a better client experience. Database CHECK constraints (Physical
 * MySQL Database Schema Design V1.0, Section 5) remain the final authority.
 * Application-only business rules (e.g. "PR must be Approved before a PO
 * can reference it") are NOT validated here — those require DB state and
 * belong in the service layer (Section 12).
 */

const ApiError = require('../utils/ApiError');

/**
 * @param {{ body?: import('zod').ZodTypeAny, query?: import('zod').ZodTypeAny, params?: import('zod').ZodTypeAny }} schemas
 */
function validate(schemas) {
  return function validateMiddleware(req, res, next) {
    try {
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query);
      }
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      return next();
    } catch (err) {
      const details = err && err.issues
        ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        : String(err);
      return next(ApiError.badRequest('VALIDATION_ERROR', details));
    }
  };
}

module.exports = validate;
