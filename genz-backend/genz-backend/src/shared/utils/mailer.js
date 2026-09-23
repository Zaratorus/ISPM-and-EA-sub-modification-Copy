/**
 * mailer.js
 * Sends the customer password-reset code. Callers use sendPasswordResetOtp()
 * and never need to know which transport is configured (env.config.js `mail`):
 *   - console: development only — prints the code to the server console and
 *     sends nothing (a demo convenience; the code is never in an API response);
 *   - smtp: sends a plain-text email through nodemailer.
 * SMTP credentials are never logged. A failed send is thrown to the caller so
 * it can roll back.
 */

const nodemailer = require('nodemailer');
const config = require('../../config/env.config');

let smtpTransporter = null;

function transporter() {
  if (!smtpTransporter) {
    const { host, port, secure, user, pass } = config.mail.smtp;
    smtpTransporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  }
  return smtpTransporter;
}

function passwordResetMessage(otp, validMinutes) {
  return {
    subject: 'Your Gen-Z password reset code',
    text: [
      'Hello,',
      '',
      'We received a request to reset the password for your Gen-Z Digital Storefront account.',
      '',
      `Your verification code is: ${otp}`,
      '',
      `This code is valid for ${validMinutes} minutes and can be used once.`,
      'Do not share this code with anyone. Gen-Z staff will never ask you for it.',
      '',
      'If you did not request a password reset, you can ignore this email; your password will not change.',
      '',
      '— Gen-Z Digital Storefront',
    ].join('\n'),
  };
}

async function sendPasswordResetOtp(email, otp, validMinutes = 10) {
  const { subject, text } = passwordResetMessage(otp, validMinutes);

  if (config.mail.transport === 'console') {
    // eslint-disable-next-line no-console
    console.log(
      `[mail:console] DEVELOPMENT ONLY — no email sent. Password reset code for ${email}: ${otp} (valid ${validMinutes} minutes)`
    );
    return;
  }

  await transporter().sendMail({ from: config.mail.from, to: email, subject, text });
}

module.exports = { sendPasswordResetOtp };
