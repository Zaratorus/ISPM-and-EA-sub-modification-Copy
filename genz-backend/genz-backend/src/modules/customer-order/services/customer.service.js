/**
 * customer.service.js
 * Customer account registration and login (DEC-02).
 *
 * Login-identifier uniqueness: `customers.contact_info` deliberately
 * carries no DATABASE-level uniqueness constraint (Logical Database Design
 * V1.1, Section B1 / Physical Schema Design V1.0, Section 3 — an earlier
 * "unique candidate key" assumption was explicitly reviewed and removed).
 * Per project-owner decision, uniqueness is instead enforced here, at the
 * APPLICATION layer only: registration rejects a contact_info already in
 * use. db/schema.sql is intentionally left unchanged. This is what makes
 * login()'s single-row lookup safe.
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const config = require('../../../config/env.config');
const ApiError = require('../../../shared/utils/ApiError');
const customerRepository = require('../repositories/customer.repository');

// Same hashing choice already approved for the Admin Access Key
// (admin-access-key.service.js) — reused here for consistency, not a new
// algorithm decision. Customer authentication itself is a settled design
// per Backend/API Architecture Design V1.0, Section 7 ("Standard
// email/password ... JWT-based session, per DEC-02"), unlike the Staff
// mechanism, which is OPEN.
const BCRYPT_ROUNDS = 12;

function issueCustomerSessionToken(customerId) {
  return jwt.sign({ customerId }, config.customerAuth.jwtSecret, {
    algorithm: 'HS256', // explicit; verification accepts HS256 only
    expiresIn: config.customerAuth.expiresIn,
  });
}

/**
 * POST /auth/customer/register — DEC-02.
 * Rejects (409) if contact_info is already registered to any ACTIVE
 * customer — an application-layer uniqueness check, not a DB constraint.
 * Auto-issues a session token for the newly created account.
 */
async function register({ name, contactInfo, password }) {
  const existing = await customerRepository.findByContactInfo(contactInfo);
  if (existing.length > 0) {
    throw ApiError.conflict('CONTACT_INFO_IN_USE', 'An account with this contact info already exists.');
  }

  const credentialsReference = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const customer = await customerRepository.create({ name, contactInfo, credentialsReference });
  const token = issueCustomerSessionToken(customer.customer_id);
  return {
    customerId: customer.customer_id,
    name: customer.name,
    contactInfo: customer.contact_info,
    token,
  };
}

/**
 * POST /auth/customer/login — DEC-02.
 * Safe to look up a single row by contact_info because register() now
 * guarantees (at the application layer) that it is unique among active
 * accounts. A pre-existing duplicate from before this rule existed, or a
 * DEACTIVATED account sharing a value with an ACTIVE one, would still be
 * possible in principle — handled defensively below by scoping the lookup
 * to ACTIVE accounts and rejecting (generic, non-revealing error) if more
 * than one somehow matches, rather than guessing which one to log in as.
 */
async function login({ contactInfo, password }) {
  const candidates = await customerRepository.findByContactInfo(contactInfo);
  const active = candidates.filter((c) => c.status === 'ACTIVE');

  if (active.length !== 1) {
    // Covers: no match, and the defensive multiple-match case above.
    // Same generic message either way — never reveal which failed.
    throw ApiError.unauthorized('INVALID_CREDENTIALS', 'Invalid contact info or password.');
  }

  const customer = active[0];
  const matches = await bcrypt.compare(password, customer.credentials_reference);
  if (!matches) {
    throw ApiError.unauthorized('INVALID_CREDENTIALS', 'Invalid contact info or password.');
  }

  const token = issueCustomerSessionToken(customer.customer_id);
  return {
    customerId: customer.customer_id,
    name: customer.name,
    contactInfo: customer.contact_info,
    token,
  };
}

module.exports = { register, login, issueCustomerSessionToken, BCRYPT_ROUNDS };
