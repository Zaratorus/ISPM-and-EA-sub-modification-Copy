const { z } = require('zod');

// ---------------------------------------------------------------- password
// Strength rules apply to NEW registrations only. Login keeps the original
// loose check so customers whose passwords predate these rules can still log
// in. Passwords are never trimmed or otherwise transformed.
const PASSWORD_MIN_CHARS = 9;
const PASSWORD_MAX_BYTES = 72; // bcrypt ignores everything after the first 72 bytes

const HAS_LETTER = /\p{L}/u;
const HAS_NUMBER = /\p{N}/u;
const HAS_SPECIAL = /[^\p{L}\p{N}\s]/u; // any symbol or punctuation; spaces do not count

// Reports only the first unmet rule, so the user sees one clear message at a time.
function checkNewPassword(value, ctx) {
  const fail = (message) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (value === '') return fail('Password is required.');
  if (value.trim() === '') return fail('Password cannot contain only whitespace.');
  if ([...value].length < PASSWORD_MIN_CHARS) {
    return fail(`Password must be at least ${PASSWORD_MIN_CHARS} characters.`);
  }
  if (Buffer.byteLength(value, 'utf8') > PASSWORD_MAX_BYTES) {
    return fail(`Password is too long (maximum ${PASSWORD_MAX_BYTES} characters; some symbols count as more than one).`);
  }
  if (!HAS_LETTER.test(value)) return fail('Password must contain at least one letter.');
  if (!HAS_NUMBER.test(value)) return fail('Password must contain at least one number.');
  if (!HAS_SPECIAL.test(value)) return fail('Password must contain at least one special character.');
  return undefined;
}

const newPasswordSchema = z
  .string({ required_error: 'Password is required.', invalid_type_error: 'Password must be text.' })
  .superRefine(checkNewPassword);

const loginPasswordSchema = z
  .string({ required_error: 'Password is required.', invalid_type_error: 'Password must be text.' })
  .min(1, 'Password is required.')
  .max(255, 'Password is too long.');

// ------------------------------------------------------------ contact info
// Email or phone number, normalised identically for registration and login:
//   email -> trimmed, lowercased
//   phone -> trimmed, spaces/hyphens removed, optional leading + kept, 9-15 digits
const CONTACT_ERROR = 'Enter a valid email address or phone number.';
const PHONE_INPUT = /^\+?[0-9][0-9 -]*$/;
const PHONE_NORMALISED = /^\+?[0-9]{9,15}$/;
const emailFormat = z.string().max(255).email();

// Trim + lowercase; null when the value is not a valid email address.
function normaliseEmail(raw) {
  const email = raw.trim().toLowerCase();
  return emailFormat.safeParse(email).success ? email : null;
}

// Trim, remove spaces/hyphens; null when the value is not a valid phone number.
function normalisePhone(raw) {
  const value = raw.trim();
  if (!PHONE_INPUT.test(value)) return null;
  const phone = value.replace(/[ -]/g, '');
  return PHONE_NORMALISED.test(phone) ? phone : null;
}

function normaliseContactInfo(raw, ctx) {
  const value = raw.trim();
  if (value.includes('@')) {
    const email = normaliseEmail(value);
    if (email) return email;
  } else {
    const phone = normalisePhone(value);
    if (phone) return phone;
  }
  ctx.addIssue({ code: z.ZodIssueCode.custom, message: CONTACT_ERROR });
  return z.NEVER;
}

const contactInfoSchema = z
  .string({ required_error: CONTACT_ERROR, invalid_type_error: CONTACT_ERROR })
  .transform(normaliseContactInfo);

// ---------------------------------------------------------- password reset
// Self-service password reset is email-only (phone numbers are refused), using
// the same email normalisation as registration/login. The code must be a
// string of exactly 6 digits — a string, so leading zeros survive; JSON
// numbers are refused rather than coerced.
const RESET_EMAIL_ERROR = 'Enter a valid email address.';
const resetEmailSchema = z
  .string({ required_error: RESET_EMAIL_ERROR, invalid_type_error: RESET_EMAIL_ERROR })
  .transform((raw, ctx) => {
    const email = normaliseEmail(raw);
    if (email) return email;
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: RESET_EMAIL_ERROR });
    return z.NEVER;
  });

const OTP_ERROR = 'Enter the 6-digit code from the email.';
const otpSchema = z.string({ required_error: OTP_ERROR, invalid_type_error: OTP_ERROR }).regex(/^[0-9]{6}$/, OTP_ERROR);

// ------------------------------------------------------------------ routes
// POST /auth/customer/register — public (DEC-02: registration itself, like
// browsing, is not gated; login is required only at checkout).
const registerSchema = {
  body: z.object({
    name: z.string().trim().min(1).max(150),
    contactInfo: contactInfoSchema,
    password: newPasswordSchema,
  }),
};

// POST /auth/customer/login — public (DEC-02). Runs before the login rate
// limiter, which therefore keys on the normalised contact info. The password
// check stays loose on purpose (see the password section above).
const loginSchema = {
  body: z.object({
    contactInfo: contactInfoSchema,
    password: loginPasswordSchema,
  }),
};

// POST /auth/customer/password/forgot — public. A phone number is not a reset
// address (reset is email-only) but must get the same generic answer as any
// email, so it becomes `email: null` and no account is looked up. Input that
// is neither an email nor a phone number is a 400 format error.
const forgotPasswordSchema = {
  body: z.object({
    email: z
      .string({ required_error: RESET_EMAIL_ERROR, invalid_type_error: RESET_EMAIL_ERROR })
      .transform((raw, ctx) => {
        const email = normaliseEmail(raw);
        if (email) return email;
        if (normalisePhone(raw)) return null;
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: RESET_EMAIL_ERROR });
        return z.NEVER;
      }),
  }),
};

// POST /auth/customer/password/verify-otp — public.
const verifyOtpSchema = {
  body: z.object({ email: resetEmailSchema, otp: otpSchema }),
};

// POST /auth/customer/password/reset — public. The new password follows the
// registration rules (newPasswordSchema, never trimmed) and must be confirmed.
const resetPasswordSchema = {
  body: z
    .object({
      email: resetEmailSchema,
      otp: otpSchema,
      newPassword: newPasswordSchema,
      confirmPassword: z.string({
        required_error: 'Confirm your new password.',
        invalid_type_error: 'Confirm your new password.',
      }),
    })
    .refine((body) => body.newPassword === body.confirmPassword, {
      message: 'Passwords do not match.',
      path: ['confirmPassword'],
    }),
};

module.exports = {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  verifyOtpSchema,
  resetPasswordSchema,
  contactInfoSchema,
  resetEmailSchema,
  otpSchema,
  newPasswordSchema,
  loginPasswordSchema,
  PASSWORD_MIN_CHARS,
  PASSWORD_MAX_BYTES,
};
