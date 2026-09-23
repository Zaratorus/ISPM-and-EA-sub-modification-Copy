/**
 * customer-login-rate-limit.middleware.js
 * Limits repeated FAILED customer logins. Mounted on POST /auth/customer/login
 * only, after validate(loginSchema), so 400 validation errors never count.
 *
 * Key: req.ip + contactInfo (trim + lowercase). One attacker therefore cannot
 * lock a customer out from another network, and people sharing a network do
 * not block each other. After `loginRateLimitMaxAttempts` failures (401)
 * inside `loginRateLimitWindowMs`, further attempts for that key get 429 with
 * a Retry-After header until the oldest failure leaves the window; the login
 * service (and its password check) is not called. A successful login clears
 * the key.
 *
 * In-memory and per process, the same trade-off as the Admin Access Key
 * limiter (admin-access-key.service.js): counts reset on restart and are not
 * shared across instances. Keys are hashed and only failure timestamps are
 * stored, never passwords or raw contact info.
 */

const crypto = require('crypto');
const config = require('../../config/env.config');
const ApiError = require('../utils/ApiError');

const SWEEP_INTERVAL_MS = 60 * 1000;
const failedAttempts = new Map(); // hashed key -> [failure timestamps, oldest first]
let lastSweepAt = 0;

function limiterKey(req) {
  const contactInfo = String(req.body.contactInfo || '').trim().toLowerCase();
  return crypto.createHash('sha256').update(`${req.ip}|${contactInfo}`).digest('hex');
}

// Drops timestamps outside the window; removes the key entirely when none remain.
function recentFailures(key, now) {
  const windowStart = now - config.customerAuth.loginRateLimitWindowMs;
  const attempts = (failedAttempts.get(key) || []).filter((t) => t > windowStart);
  if (attempts.length > 0) {
    failedAttempts.set(key, attempts);
  } else {
    failedAttempts.delete(key);
  }
  return attempts;
}

// Removes expired entries for every key, at most once per SWEEP_INTERVAL_MS.
function sweepExpired(now) {
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  for (const key of failedAttempts.keys()) {
    recentFailures(key, now);
  }
}

function customerLoginRateLimit(req, res, next) {
  const now = Date.now();
  sweepExpired(now);

  const key = limiterKey(req);
  const attempts = recentFailures(key, now);

  if (attempts.length >= config.customerAuth.loginRateLimitMaxAttempts) {
    const retryAfterMs = attempts[0] + config.customerAuth.loginRateLimitWindowMs - now;
    res.set('Retry-After', String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
    return next(
      ApiError.tooManyRequests('TOO_MANY_LOGIN_ATTEMPTS', 'Too many failed login attempts. Please try again later.')
    );
  }

  // Record the outcome once the login response has been sent.
  res.on('finish', () => {
    if (res.statusCode === 401) {
      const at = Date.now();
      const updated = recentFailures(key, at);
      updated.push(at);
      failedAttempts.set(key, updated);
    } else if (res.statusCode < 400) {
      failedAttempts.delete(key);
    }
  });
  return next();
}

// Exposed for tests only.
function resetLoginAttempts() {
  failedAttempts.clear();
  lastSweepAt = 0;
}

function trackedKeyCount() {
  return failedAttempts.size;
}

module.exports = { customerLoginRateLimit, resetLoginAttempts, trackedKeyCount };
