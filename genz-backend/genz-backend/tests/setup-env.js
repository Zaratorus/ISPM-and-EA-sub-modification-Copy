/**
 * setup-env.js
 * Runs before every test file (see jest.config.js `setupFiles`). Provides
 * fake-but-well-formed values for the environment variables env.config.js
 * requires at module-load time, so requiring any file in the src/ require
 * graph never fails on a missing variable during unit testing. No test
 * relies on these values connecting to a real service — DB access is
 * always mocked at the shared/db/connection module boundary.
 */

process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '3306';
process.env.DB_USER = process.env.DB_USER || 'test_user';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'test_password';
process.env.DB_NAME = process.env.DB_NAME || 'test_db';
// Test-only JWT secrets: at least 32 characters, as env.config.js requires.
process.env.CUSTOMER_JWT_SECRET = process.env.CUSTOMER_JWT_SECRET || 'test_customer_jwt_secret_for_unit_tests_only';
process.env.ADMIN_SESSION_JWT_SECRET =
  process.env.ADMIN_SESSION_JWT_SECRET || 'test_admin_session_jwt_secret_for_unit_tests_only';
process.env.COURIER_LINK_SECRET = process.env.COURIER_LINK_SECRET || 'test_courier_link_secret_for_unit_tests_only';
// Mail: tests run with NODE_ENV=test, where the console transport is refused, so
// SMTP mode with fake values. Nothing is ever sent — nodemailer is mocked
// wherever mail is exercised, and the transporter is only created on first send.
process.env.MAIL_TRANSPORT = process.env.MAIL_TRANSPORT || 'smtp';
process.env.SMTP_HOST = process.env.SMTP_HOST || 'smtp.test.invalid';
process.env.SMTP_PORT = process.env.SMTP_PORT || '587';
process.env.SMTP_SECURE = process.env.SMTP_SECURE || 'false';
process.env.SMTP_USER = process.env.SMTP_USER || 'test-smtp-user';
process.env.SMTP_PASS = process.env.SMTP_PASS || 'test-smtp-pass';
process.env.MAIL_FROM = process.env.MAIL_FROM || 'Gen-Z Test <no-reply@test.invalid>';
