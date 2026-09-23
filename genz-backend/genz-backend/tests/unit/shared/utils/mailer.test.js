/**
 * mailer.test.js
 * sendPasswordResetOtp() with nodemailer mocked — no real email is ever sent.
 * Console transport (development), SMTP transport, and SMTP failure.
 */

jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

const ORIGINAL_ENV = process.env;

function loadMailer(env) {
  let loaded;
  jest.isolateModules(() => {
    process.env = { ...ORIGINAL_ENV, ...env };
    const nodemailer = require('nodemailer');
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'x' });
    nodemailer.createTransport.mockReturnValue({ sendMail });
    loaded = { mailer: require('../../../../src/shared/utils/mailer'), nodemailer, sendMail };
  });
  return loaded;
}

afterEach(() => {
  process.env = ORIGINAL_ENV;
  jest.restoreAllMocks();
});

describe('console transport (development only)', () => {
  it('prints a development-only line with the code and sends nothing', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const { mailer, nodemailer } = loadMailer({ NODE_ENV: 'development', MAIL_TRANSPORT: 'console' });

    await expect(mailer.sendPasswordResetOtp('jane@example.com', '004821', 10)).resolves.toBeUndefined();

    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
    const line = log.mock.calls[0][0];
    expect(line).toContain('DEVELOPMENT ONLY');
    expect(line).toContain('jane@example.com');
    expect(line).toContain('004821');
    expect(line).not.toContain(ORIGINAL_ENV.SMTP_PASS);
  });
});

describe('SMTP transport', () => {
  it('sends a plain-text email through nodemailer with the configured server', async () => {
    const { mailer, nodemailer, sendMail } = loadMailer({ NODE_ENV: 'test', MAIL_TRANSPORT: 'smtp', SMTP_SECURE: 'false' });

    await expect(mailer.sendPasswordResetOtp('jane@example.com', '004821', 10)).resolves.toBeUndefined();

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: ORIGINAL_ENV.SMTP_HOST,
      port: Number(ORIGINAL_ENV.SMTP_PORT),
      secure: false,
      auth: { user: ORIGINAL_ENV.SMTP_USER, pass: ORIGINAL_ENV.SMTP_PASS },
    });
    const mail = sendMail.mock.calls[0][0];
    expect(mail).toMatchObject({ from: ORIGINAL_ENV.MAIL_FROM, to: 'jane@example.com', subject: 'Your Gen-Z password reset code' });
    expect(mail.text).toContain('Gen-Z Digital Storefront');
    expect(mail.text).toContain('reset the password');
    expect(mail.text).toContain('004821');
    expect(mail.text).toContain('valid for 10 minutes');
    expect(mail.text).toContain('Do not share this code');
    expect(mail.text).not.toContain(ORIGINAL_ENV.SMTP_PASS);
  });

  it('reuses one transporter for later emails', async () => {
    const { mailer, nodemailer, sendMail } = loadMailer({ NODE_ENV: 'test', MAIL_TRANSPORT: 'smtp' });
    await mailer.sendPasswordResetOtp('a@example.com', '111111', 10);
    await mailer.sendPasswordResetOtp('b@example.com', '222222', 10);
    expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it('throws a send failure to the caller (so it can roll back) and logs nothing itself', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { mailer, sendMail } = loadMailer({ NODE_ENV: 'test', MAIL_TRANSPORT: 'smtp' });
    sendMail.mockRejectedValue(new Error('Invalid login: 535 authentication failed'));

    await expect(mailer.sendPasswordResetOtp('jane@example.com', '004821', 10)).rejects.toThrow('535 authentication failed');
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
