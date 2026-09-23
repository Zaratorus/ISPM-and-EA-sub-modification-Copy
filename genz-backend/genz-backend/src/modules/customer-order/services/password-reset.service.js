/**
 * password-reset.service.js
 * Owning module: B (EP-02). Customer self-service password reset with an
 * emailed one-time code:
 *   requestPasswordReset(email) -> always the same generic answer; for an
 *                                   eligible account a code is issued in the background;
 *   verifyOtp(email, otp)       -> checks the current code (does not use it up);
 *   resetPassword({ ... })      -> checks the code again and changes the password.
 *
 * Rules: 6-digit code from crypto.randomInt, stored only as a bcrypt hash
 * (cost 10); valid 10 minutes; at most 5 wrong attempts per code; a new code
 * ends older unused ones; single use; 60-second resend cooldown and at most 5
 * codes per account per hour. Email-only: the address must belong to exactly
 * one ACTIVE customer (the same lookup as login). No automatic login after a
 * reset, and existing customer JWTs are not revoked (they expire as usual).
 *
 * Account enumeration: "forgot" always answers the same way and issues the
 * code in the background, so neither the response nor its timing depends on
 * whether the account exists. verify/reset use one error
 * (400 INVALID_OR_EXPIRED_CODE) for every failure and do a dummy bcrypt
 * comparison when there is no code to compare against.
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { withTransaction } = require('../../../shared/db/connection');
const ApiError = require('../../../shared/utils/ApiError');
const { sendPasswordResetOtp } = require('../../../shared/utils/mailer');
const customerRepository = require('../repositories/customer.repository');
const passwordResetRepository = require('../repositories/password-reset.repository');
const activityLogService = require('../../store-administration/services/activity-log.service');
const { BCRYPT_ROUNDS } = require('./customer.service');

const OTP_TTL_MINUTES = 10;
const OTP_MAX_FAILED_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_RATE_WINDOW_SECONDS = 60 * 60;
const OTP_MAX_REQUESTS_PER_WINDOW = 5;
const OTP_BCRYPT_ROUNDS = 10;

const FORGOT_MESSAGE = 'If an account with that email exists, a verification code has been sent.';
const RESET_DONE_MESSAGE = 'Password updated. Please log in.';

function invalidOrExpiredCode() {
  return ApiError.badRequest('INVALID_OR_EXPIRED_CODE', 'The code is invalid or has expired. Request a new code and try again.');
}

// Same rule as login: exactly one ACTIVE customer with this (normalised) email.
async function findEligibleCustomer(email) {
  const active = (await customerRepository.findByContactInfo(email)).filter((c) => c.status === 'ACTIVE');
  return active.length === 1 ? active[0] : null;
}

function generateOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

// Keeps unknown addresses (nothing to compare against) about as slow as real checks.
let dummyHashPromise = null;
async function dummyCompare(otp) {
  dummyHashPromise = dummyHashPromise || bcrypt.hash('no-code-to-compare', OTP_BCRYPT_ROUNDS);
  await bcrypt.compare(otp, await dummyHashPromise);
}

// Background work (code issuing) is tracked so tests can wait for it.
const pendingWork = new Set();
function runInBackground(task) {
  const work = Promise.resolve()
    .then(task)
    .finally(() => pendingWork.delete(work));
  pendingWork.add(work);
}
function settleBackgroundWork() {
  return Promise.all([...pendingWork]);
}

/**
 * Issues and emails a new code for one customer, in one transaction on the
 * locked customer row. Returns true when a code was sent, false when the
 * cooldown or hourly limit applied. The email is sent last, still inside the
 * transaction: if sending fails, everything rolls back, so the previous code
 * stays valid and no unusable code (or used-up cooldown) is left behind.
 */
async function issueOtp(customer) {
  const customerId = customer.customer_id;
  return withTransaction(async (conn) => {
    await customerRepository.lockById(customerId, conn);
    const { inCooldown, inWindow } = await passwordResetRepository.countRecentRequests(
      customerId,
      OTP_RESEND_COOLDOWN_SECONDS,
      OTP_RATE_WINDOW_SECONDS,
      conn
    );
    if (inCooldown > 0 || inWindow >= OTP_MAX_REQUESTS_PER_WINDOW) {
      return false;
    }

    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, OTP_BCRYPT_ROUNDS);
    await passwordResetRepository.invalidateActive(customerId, conn);
    await passwordResetRepository.create({ customerId, otpHash, ttlMinutes: OTP_TTL_MINUTES }, conn);
    await activityLogService.logActivity(
      {
        actorType: null,
        actorId: null,
        actionType: 'PASSWORD_RESET_REQUESTED',
        affectedEntityType: 'Customer',
        affectedEntityId: customerId,
        originatingModule: 'B',
        contextNote: `Customer #${customerId} requested a password reset code.`,
      },
      conn
    );
    await sendPasswordResetOtp(customer.contact_info, otp, OTP_TTL_MINUTES);
    return true;
  });
}

/**
 * POST /auth/customer/password/forgot — public. Same answer for every address.
 * `email` is null when a phone number was submitted (reset is email-only):
 * nothing is looked up or sent, and the answer is the same.
 */
async function requestPasswordReset(email) {
  const customer = email ? await findEligibleCustomer(email) : null;
  if (customer) {
    // Not awaited: the response must not take longer when the account exists.
    runInBackground(async () => {
      try {
        await issueOtp(customer);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          `[password-reset] Could not issue a reset code for customer #${customer.customer_id}: ${err && err.message}`
        );
      }
    });
  }
  return { message: FORGOT_MESSAGE };
}

/**
 * Runs `onValid` inside one transaction while the customer's current code is
 * locked, but only if the submitted code matches it. A wrong code increments
 * the attempt count and is committed before the error is returned.
 */
async function withValidCode(email, otp, onValid) {
  const customer = await findEligibleCustomer(email);
  if (!customer) {
    await dummyCompare(otp);
    throw invalidOrExpiredCode();
  }

  const valid = await withTransaction(async (conn) => {
    const reset = await passwordResetRepository.findActiveForUpdate(customer.customer_id, OTP_MAX_FAILED_ATTEMPTS, conn);
    if (!reset) {
      await dummyCompare(otp);
      return false;
    }
    if (!(await bcrypt.compare(otp, reset.otp_hash))) {
      await passwordResetRepository.incrementFailedAttempts(reset.password_reset_id, conn);
      return false;
    }
    await onValid({ conn, customer, reset });
    return true;
  });

  if (!valid) {
    throw invalidOrExpiredCode();
  }
}

/** POST /auth/customer/password/verify-otp — public. Does not use the code up. */
async function verifyOtp(email, otp) {
  await withValidCode(email, otp, async () => {});
  return { verified: true };
}

/**
 * POST /auth/customer/password/reset — public. Re-checks the code, then changes
 * the password and marks the code used in the same transaction (both or neither).
 */
async function resetPassword({ email, otp, newPassword }) {
  await withValidCode(email, otp, async ({ conn, customer, reset }) => {
    const credentialsReference = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const updated = await customerRepository.updateCredentials(customer.customer_id, credentialsReference, conn);
    const used = updated === 1 ? await passwordResetRepository.markUsed(reset.password_reset_id, conn) : 0;
    if (used === 0) {
      throw invalidOrExpiredCode(); // rolls back the credential update
    }
    await activityLogService.logActivity(
      {
        actorType: null,
        actorId: null,
        actionType: 'PASSWORD_RESET_COMPLETED',
        affectedEntityType: 'Customer',
        affectedEntityId: customer.customer_id,
        originatingModule: 'B',
        contextNote: `Customer #${customer.customer_id} completed a password reset.`,
      },
      conn
    );
  });
  return { message: RESET_DONE_MESSAGE };
}

module.exports = {
  requestPasswordReset,
  verifyOtp,
  resetPassword,
  issueOtp,
  settleBackgroundWork,
  FORGOT_MESSAGE,
  RESET_DONE_MESSAGE,
  OTP_TTL_MINUTES,
  OTP_MAX_FAILED_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_MAX_REQUESTS_PER_WINDOW,
  OTP_BCRYPT_ROUNDS,
};
