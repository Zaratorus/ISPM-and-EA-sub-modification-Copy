/**
 * asyncHandler.js
 * Wraps an async Express route handler so any rejected promise is forwarded
 * to next(err) automatically, reaching error-handler.middleware.js instead
 * of crashing the process or requiring try/catch in every controller.
 */

function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
