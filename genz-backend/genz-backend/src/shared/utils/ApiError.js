/**
 * ApiError.js
 * A single, typed error class used by every service across every module.
 * Route handlers never throw raw Error objects for business-rule failures —
 * they throw ApiError so error-handler.middleware.js can map it to the
 * correct HTTP status consistently (see Backend/API Architecture Design V1.0,
 * Section 10 — Error Handling Strategy).
 */

class ApiError extends Error {
  /**
   * @param {number} statusCode
   * @param {string} code - short machine-readable code, e.g. "INSUFFICIENT_STOCK"
   * @param {string} message - human-readable message
   */
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
  }

  static badRequest(code, message) {
    return new ApiError(400, code, message);
  }
  static unauthorized(code, message) {
    return new ApiError(401, code, message);
  }
  static forbidden(code, message) {
    return new ApiError(403, code, message);
  }
  static notFound(code, message) {
    return new ApiError(404, code, message);
  }
  static conflict(code, message) {
    return new ApiError(409, code, message);
  }
  static unprocessable(code, message) {
    return new ApiError(422, code, message);
  }
  static tooManyRequests(code, message) {
    return new ApiError(429, code, message);
  }
}

module.exports = ApiError;
