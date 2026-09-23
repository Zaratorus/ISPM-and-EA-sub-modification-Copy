/**
 * mail.config.test.js
 * Startup validation of the mail settings in env.config.js: the console
 * transport only in development, and every SMTP setting required and checked
 * in SMTP mode — without the 32-character secret rule on SMTP_PASS and without
 * ever putting a setting's value into an error message.
 */

jest.mock('dotenv', () => ({ config: jest.fn() }));

const ORIGINAL_ENV = process.env;
const SMTP = {
  MAIL_TRANSPORT: 'smtp',
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '465',
  SMTP_SECURE: 'true',
  SMTP_USER: 'store@example.com',
  SMTP_PASS: 'short pass',
  MAIL_FROM: 'Gen-Z Store <store@example.com>',
};

function loadConfig(env) {
  let config;
  jest.isolateModules(() => {
    process.env = { ...ORIGINAL_ENV, ...env };
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
    }
    config = require('../../../src/config/env.config');
  });
  return config;
}
function loadError(env) {
  try {
    loadConfig(env);
  } catch (err) {
    return err;
  }
  throw new Error('expected configuration loading to fail');
}

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('console transport', () => {
  it('is the default in development', () => {
    expect(loadConfig({ NODE_ENV: 'development', MAIL_TRANSPORT: undefined }).mail).toEqual({ transport: 'console' });
  });

  it('is allowed when NODE_ENV=development', () => {
    expect(loadConfig({ NODE_ENV: 'development', MAIL_TRANSPORT: 'console' }).mail).toEqual({ transport: 'console' });
  });

  it.each(['production', 'test'])('stops startup when NODE_ENV=%s', (nodeEnv) => {
    expect(loadError({ NODE_ENV: nodeEnv, MAIL_TRANSPORT: 'console' }).message).toMatch(
      /^Invalid configuration: MAIL_TRANSPORT=console is only allowed when NODE_ENV=development/
    );
  });

  it('an unset MAIL_TRANSPORT in production also stops startup (console is the default)', () => {
    expect(loadError({ NODE_ENV: 'production', MAIL_TRANSPORT: undefined }).message).toMatch(/only allowed when NODE_ENV=development/);
  });
});

describe('MAIL_TRANSPORT value', () => {
  it.each(['sendgrid', 'ses', 'smtps'])('rejects %j', (transport) => {
    expect(loadError({ MAIL_TRANSPORT: transport }).message).toBe('Invalid configuration: MAIL_TRANSPORT must be "console" or "smtp".');
  });
});

describe('SMTP transport', () => {
  it('loads a complete SMTP configuration (a short SMTP_PASS is fine: no 32-character rule)', () => {
    expect(loadConfig({ NODE_ENV: 'production', ...SMTP }).mail).toEqual({
      transport: 'smtp',
      from: 'Gen-Z Store <store@example.com>',
      smtp: { host: 'smtp.example.com', port: 465, secure: true, user: 'store@example.com', pass: 'short pass' },
    });
  });

  it.each(['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'])('requires %s', (name) => {
    expect(loadError({ ...SMTP, [name]: undefined }).message).toBe(`Invalid configuration: ${name} is required when MAIL_TRANSPORT=smtp.`);
    expect(loadError({ ...SMTP, [name]: '   ' }).message).toBe(`Invalid configuration: ${name} is required when MAIL_TRANSPORT=smtp.`);
  });

  it.each(['yes', '1', 'TRUE-ish'])('rejects SMTP_SECURE=%j', (value) => {
    expect(loadError({ ...SMTP, SMTP_SECURE: value }).message).toBe('Invalid configuration: SMTP_SECURE must be "true" or "false".');
  });

  it.each(['abc', '0', '70000', '587.5'])('rejects SMTP_PORT=%j', (value) => {
    expect(loadError({ ...SMTP, SMTP_PORT: value }).message).toBe('Invalid configuration: SMTP_PORT must be a port number from 1 to 65535.');
  });

  it('never includes a setting value (such as SMTP_PASS) in an error message', () => {
    const err = loadError({ ...SMTP, SMTP_PASS: 'Very-Secret-Smtp-Password', SMTP_SECURE: 'maybe' });
    expect(err.message).not.toContain('Very-Secret-Smtp-Password');
    expect(err.stack).not.toContain('Very-Secret-Smtp-Password');
  });
});
