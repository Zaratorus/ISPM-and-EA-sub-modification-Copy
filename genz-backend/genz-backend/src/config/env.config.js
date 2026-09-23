/**
 * env.config.js
 * Loads and validates required environment variables in one place.
 * Every other module reads config via this file, never via process.env directly,
 * so that a missing variable fails fast and loudly at startup.
 */

require('dotenv').config();

function required(name, fallback = undefined) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Optional positive-integer setting; falls back to the default when unset or invalid.
function positiveInt(name, fallback) {
  const n = parseInt(process.env[name], 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

// Secrets (both JWT secrets and the courier-link secret) get a stricter startup
// check: the server refuses to start with a missing, placeholder or short
// secret. Error messages name the variable but never include its value.
const MIN_SECRET_LENGTH = 32;
const PLACEHOLDER_SECRETS = [
  'change_this_to_a_long_random_string', // .env.example CUSTOMER_JWT_SECRET
  'change_this_to_a_different_long_random_string', // .env.example ADMIN_SESSION_JWT_SECRET
  'change_this_to_another_long_random_string', // .env.example COURIER_LINK_SECRET
];
const SECRET_HINT =
  "Generate one with: node -e \"console.log(require('crypto').randomBytes(64).toString('base64url'))\"";

function requiredSecret(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`Invalid configuration: ${name} is missing or empty. ${SECRET_HINT}`);
  }
  if (PLACEHOLDER_SECRETS.includes(value.trim())) {
    throw new Error(`Invalid configuration: ${name} still uses the placeholder value from .env.example. ${SECRET_HINT}`);
  }
  if (value.trim().length < MIN_SECRET_LENGTH) {
    throw new Error(
      `Invalid configuration: ${name} is too short; it must be at least ${MIN_SECRET_LENGTH} characters. ${SECRET_HINT}`
    );
  }
  return value;
}

// Mail for customer password-reset codes. MAIL_TRANSPORT=console prints the
// code to the server console instead of sending it and is refused outside
// NODE_ENV=development; MAIL_TRANSPORT=smtp sends through nodemailer.
// SMTP_PASS is required but not held to the 32-character secret rule, and no
// setting value is ever included in an error message.
const MAIL_TRANSPORTS = ['console', 'smtp'];

function requiredMailSetting(name, { trim = true } = {}) {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`Invalid configuration: ${name} is required when MAIL_TRANSPORT=smtp.`);
  }
  return trim ? value.trim() : value;
}

function mailConfig() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const transport = (process.env.MAIL_TRANSPORT || 'console').trim().toLowerCase();
  if (!MAIL_TRANSPORTS.includes(transport)) {
    throw new Error('Invalid configuration: MAIL_TRANSPORT must be "console" or "smtp".');
  }
  if (transport === 'console') {
    if (nodeEnv !== 'development') {
      throw new Error(
        `Invalid configuration: MAIL_TRANSPORT=console is only allowed when NODE_ENV=development (NODE_ENV is "${nodeEnv}"). Set MAIL_TRANSPORT=smtp and the SMTP_* settings.`
      );
    }
    return { transport };
  }

  const port = Number(requiredMailSetting('SMTP_PORT'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid configuration: SMTP_PORT must be a port number from 1 to 65535.');
  }
  const secure = requiredMailSetting('SMTP_SECURE').toLowerCase();
  if (secure !== 'true' && secure !== 'false') {
    throw new Error('Invalid configuration: SMTP_SECURE must be "true" or "false".');
  }
  return {
    transport,
    from: requiredMailSetting('MAIL_FROM'),
    smtp: {
      host: requiredMailSetting('SMTP_HOST'),
      port,
      secure: secure === 'true',
      user: requiredMailSetting('SMTP_USER'),
      pass: requiredMailSetting('SMTP_PASS', { trim: false }),
    },
  };
}

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  apiPrefix: process.env.API_PREFIX || '/api/v1',

  db: {
    host: required('DB_HOST'),
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    database: required('DB_NAME'),
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10),
  },

  customerAuth: {
    jwtSecret: requiredSecret('CUSTOMER_JWT_SECRET'),
    expiresIn: process.env.CUSTOMER_JWT_EXPIRES_IN || '7d',
    // Failed-login limiter for POST /auth/customer/login (not secrets).
    loginRateLimitWindowMs: positiveInt('CUSTOMER_LOGIN_RATE_LIMIT_WINDOW_MS', 900000),
    loginRateLimitMaxAttempts: positiveInt('CUSTOMER_LOGIN_RATE_LIMIT_MAX_ATTEMPTS', 5),
  },

  adminAccessKey: {
    // ADMIN_ACCESS_KEY_RAW is only read by the one-time seed script, not at app runtime.
    sessionJwtSecret: requiredSecret('ADMIN_SESSION_JWT_SECRET'),
    sessionExpiresIn: process.env.ADMIN_SESSION_EXPIRES_IN || '12h',
    rateLimitWindowMs: parseInt(process.env.ADMIN_ACCESS_KEY_RATE_LIMIT_WINDOW_MS || '900000', 10),
    rateLimitMaxAttempts: parseInt(process.env.ADMIN_ACCESS_KEY_RATE_LIMIT_MAX_ATTEMPTS || '5', 10),
  },

  // Signs each delivery's courier link (HMAC-SHA256, see shared/utils/courier-link.js).
  // Delivery persons have no account; the signed link is their access to one delivery.
  courierLink: {
    secret: requiredSecret('COURIER_LINK_SECRET'),
  },

  // { transport: 'console' } or { transport: 'smtp', from, smtp: { host, port, secure, user, pass } }
  mail: mailConfig(),

  r2: {
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucketName: process.env.R2_BUCKET_NAME || '',
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL || '',
  },

  whatsapp: {
    // OPEN: exact mechanism undecided (Backend/API Architecture Design V1.0, Section 15 item 3)
    storeNumber: process.env.STORE_WHATSAPP_NUMBER || '',
  },
};
