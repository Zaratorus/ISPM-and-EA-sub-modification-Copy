/**
 * admin-access-key.service.js
 * Implements the locked Owner/Admin entry flow:
 *   Storefront → Footer → Small Shop Logo → Access Key input
 *   → server-side validation → correct key → session token
 *                              → incorrect key → generic 401
 *
 * OPEN (Backend/API Architecture Design V1.0, Section 15 item 7):
 * the exact hashing algorithm is not dictated by any prior document.
 * bcrypt is used here as a concrete, reasonable choice for the running
 * codebase — this is a disclosed backend-implementation decision, not a
 * silent resolution of a business/security decision the team should still
 * confirm; swapping algorithms later only requires changing this file and
 * re-seeding admin_access_key via scripts/set-admin-access-key.js.
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const config = require('../../../config/env.config');
const ApiError = require('../../../shared/utils/ApiError');
const adminAccessKeyRepository = require('../repositories/admin-access-key.repository');

const BCRYPT_ROUNDS = 12;

// In-memory rate limiting per IP. Simple and sufficient for a single-process
// academic deployment; a distributed store (e.g. Redis) would be needed if
// the app is ever horizontally scaled — noted, not implemented, since no
// prior document requires that scale.
const attemptLog = new Map(); // ip -> [timestamps]

function isRateLimited(ip) {
  const now = Date.now();
  const windowStart = now - config.adminAccessKey.rateLimitWindowMs;
  const attempts = (attemptLog.get(ip) || []).filter((t) => t > windowStart);
  attemptLog.set(ip, attempts);
  return attempts.length >= config.adminAccessKey.rateLimitMaxAttempts;
}

function recordAttempt(ip) {
  const attempts = attemptLog.get(ip) || [];
  attempts.push(Date.now());
  attemptLog.set(ip, attempts);
}

/**
 * @param {string} submittedKey
 * @param {string} ip
 * @returns {Promise<string>} a session token
 */
async function validateAccessKey(submittedKey, ip) {
  if (isRateLimited(ip)) {
    // Same generic error as a wrong key — do not reveal that rate limiting
    // was the cause, per the locked "incorrect key → access denied" rule
    // giving no hint about why validation failed.
    throw ApiError.unauthorized('ACCESS_DENIED', 'Access denied.');
  }

  const storedHash = await adminAccessKeyRepository.getHash();
  if (!storedHash) {
    // No key has been seeded yet — treat identically to a wrong key from
    // the client's perspective (never reveal system configuration state).
    recordAttempt(ip);
    throw ApiError.unauthorized('ACCESS_DENIED', 'Access denied.');
  }

  const matches = await bcrypt.compare(submittedKey, storedHash);
  if (!matches) {
    recordAttempt(ip);
    throw ApiError.unauthorized('ACCESS_DENIED', 'Access denied.');
  }

  return jwt.sign({ type: 'OWNER_ADMIN' }, config.adminAccessKey.sessionJwtSecret, {
    algorithm: 'HS256', // explicit; verification accepts HS256 only
    expiresIn: config.adminAccessKey.sessionExpiresIn,
  });
}

/** Used only by scripts/set-admin-access-key.js (one-time setup), never by a route. */
async function seedAccessKey(rawKey) {
  const hash = await bcrypt.hash(rawKey, BCRYPT_ROUNDS);
  await adminAccessKeyRepository.setHash(hash);
}

module.exports = { validateAccessKey, seedAccessKey };
