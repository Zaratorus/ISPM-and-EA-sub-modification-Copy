/**
 * env.config.test.js
 * Startup validation of the secrets (CUSTOMER_JWT_SECRET,
 * ADMIN_SESSION_JWT_SECRET and COURIER_LINK_SECRET): missing, empty,
 * placeholder and short values must stop configuration loading with an error
 * that names the variable but never contains the secret itself.
 *
 * dotenv is mocked so the developer's real .env can never fill in a value
 * a test has deliberately removed. Each case loads env.config.js fresh.
 */

jest.mock('dotenv', () => ({ config: jest.fn() }));

const crypto = require('crypto');

const PLACEHOLDERS = [
  'change_this_to_a_long_random_string',
  'change_this_to_a_different_long_random_string',
  'change_this_to_another_long_random_string',
];
const VALID_CUSTOMER_SECRET = crypto.randomBytes(48).toString('base64url');
const VALID_ADMIN_SECRET = crypto.randomBytes(48).toString('base64url');
const VALID_COURIER_SECRET = crypto.randomBytes(48).toString('base64url');
const VALID_SECRETS = [VALID_CUSTOMER_SECRET, VALID_ADMIN_SECRET, VALID_COURIER_SECRET];

const ORIGINAL_ENV = process.env;

function loadConfig() {
  let config;
  jest.isolateModules(() => {
    config = require('../../../src/config/env.config');
  });
  return config;
}

function loadError() {
  try {
    loadConfig();
  } catch (err) {
    return err;
  }
  throw new Error('expected configuration loading to fail');
}

beforeEach(() => {
  process.env = {
    ...ORIGINAL_ENV,
    CUSTOMER_JWT_SECRET: VALID_CUSTOMER_SECRET,
    ADMIN_SESSION_JWT_SECRET: VALID_ADMIN_SECRET,
    COURIER_LINK_SECRET: VALID_COURIER_SECRET,
  };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('env.config secret validation — accepted', () => {
  it('loads when all three secrets are long random values', () => {
    const config = loadConfig();
    expect(config.customerAuth.jwtSecret).toBe(VALID_CUSTOMER_SECRET);
    expect(config.adminAccessKey.sessionJwtSecret).toBe(VALID_ADMIN_SECRET);
    expect(config.courierLink.secret).toBe(VALID_COURIER_SECRET);
  });

  it('accepts a secret of exactly 32 characters (the minimum)', () => {
    process.env.CUSTOMER_JWT_SECRET = 'a'.repeat(32);
    process.env.COURIER_LINK_SECRET = 'c'.repeat(32);
    expect(() => loadConfig()).not.toThrow();
  });

  it('leaves the expiry settings unchanged', () => {
    const config = loadConfig();
    expect(config.customerAuth.expiresIn).toBe(process.env.CUSTOMER_JWT_EXPIRES_IN || '7d');
    expect(config.adminAccessKey.sessionExpiresIn).toBe(process.env.ADMIN_SESSION_EXPIRES_IN || '12h');
  });
});

describe.each(['CUSTOMER_JWT_SECRET', 'ADMIN_SESSION_JWT_SECRET', 'COURIER_LINK_SECRET'])('env.config — %s rejected', (name) => {
  it('when missing', () => {
    delete process.env[name];
    expect(loadError().message).toMatch(new RegExp(`${name} is missing or empty`));
  });

  it('when empty', () => {
    process.env[name] = '';
    expect(loadError().message).toMatch(new RegExp(`${name} is missing or empty`));
  });

  it('when only whitespace', () => {
    process.env[name] = '     ';
    expect(loadError().message).toMatch(new RegExp(`${name} is missing or empty`));
  });

  it.each(PLACEHOLDERS)('when set to the .env.example placeholder "%s"', (placeholder) => {
    process.env[name] = placeholder;
    const err = loadError();
    expect(err.message).toMatch(new RegExp(`${name} still uses the placeholder value`));
    expect(err.message).not.toContain(placeholder);
  });

  it('when shorter than 32 characters', () => {
    const shortSecret = 'b'.repeat(31);
    process.env[name] = shortSecret;
    const err = loadError();
    expect(err.message).toMatch(new RegExp(`${name} is too short; it must be at least 32 characters`));
    expect(err.message).not.toContain(shortSecret);
  });
});

describe('env.config — error messages never reveal the secret', () => {
  it.each([
    ['short customer secret', 'CUSTOMER_JWT_SECRET', 'My-Short-Customer-Secret-1234'],
    ['short admin secret', 'ADMIN_SESSION_JWT_SECRET', 'My-Short-Admin-Secret-5678'],
    ['short courier secret', 'COURIER_LINK_SECRET', 'My-Short-Courier-Secret-90'],
    ['placeholder customer secret', 'CUSTOMER_JWT_SECRET', PLACEHOLDERS[0]],
    ['placeholder admin secret', 'ADMIN_SESSION_JWT_SECRET', PLACEHOLDERS[1]],
    ['placeholder courier secret', 'COURIER_LINK_SECRET', PLACEHOLDERS[2]],
  ])('%s', (_label, name, badValue) => {
    process.env[name] = badValue;
    const err = loadError();
    expect(err.message).toContain(name);
    expect(err.message).not.toContain(badValue);
    expect(err.stack).not.toContain(badValue);
    // the other, valid secrets must not leak either
    for (const valid of VALID_SECRETS) {
      expect(err.message).not.toContain(valid);
    }
  });
});
