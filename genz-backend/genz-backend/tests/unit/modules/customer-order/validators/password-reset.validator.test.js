/**
 * password-reset.validator.test.js
 * Forgot / verify-otp / reset request bodies: email-only (phones refused,
 * same normalisation as login), a 6-digit code as a string, and the new
 * password checked by the existing registration rules plus confirmation.
 */

const {
  forgotPasswordSchema,
  verifyOtpSchema,
  resetPasswordSchema,
  newPasswordSchema,
} = require('../../../../../src/modules/customer-order/validators/customer.validator');

const EMAIL_ERROR = 'Enter a valid email address.';
const OTP_ERROR = 'Enter the 6-digit code from the email.';
const forgot = (body) => forgotPasswordSchema.body.safeParse(body);
const verify = (body) => verifyOtpSchema.body.safeParse(body);
const reset = (overrides) =>
  resetPasswordSchema.body.safeParse({
    email: 'jane@example.com',
    otp: '004821',
    newPassword: 'NewPass123!',
    confirmPassword: 'NewPass123!',
    ...overrides,
  });
const messages = (result) => (result.success ? [] : result.error.issues.map((i) => i.message));

describe('email (forgot / verify / reset)', () => {
  it('accepts a valid email and normalises it like login (trim + lowercase)', () => {
    expect(forgot({ email: '  Jane.Doe@Example.COM ' }).data).toEqual({ email: 'jane.doe@example.com' });
  });

  it.each(['jane@', 'jane@example', 'not an email', ''])('rejects the invalid email %j', (email) => {
    expect(messages(forgot({ email }))).toEqual([EMAIL_ERROR]);
  });

  it.each(['+94771234567', '0771234567', '077 123 4567'])(
    'forgot: the phone number %j is not a reset address — it becomes email: null (same generic answer later)',
    (email) => {
      expect(forgot({ email })).toEqual({ success: true, data: { email: null } });
    }
  );

  it.each(['+94771234567', '0771234567'])('verify/reset: reject the phone number %j (reset is email-only)', (email) => {
    expect(messages(verify({ email, otp: '123456' }))).toEqual([EMAIL_ERROR]);
    expect(messages(reset({ email }))).toEqual([EMAIL_ERROR]);
  });

  it.each(['12345', '+94 77 abc'])('forgot: rejects %j (neither an email nor a phone number)', (email) => {
    expect(messages(forgot({ email }))).toEqual([EMAIL_ERROR]);
  });

  it('rejects a missing or non-text email (malformed request)', () => {
    expect(messages(forgot({}))).toEqual([EMAIL_ERROR]);
    expect(messages(forgot({ email: 12345 }))).toEqual([EMAIL_ERROR]);
  });
});

describe('otp', () => {
  it('accepts exactly 6 digits and keeps leading zeros', () => {
    expect(verify({ email: 'jane@example.com', otp: '004821' }).data.otp).toBe('004821');
  });

  it.each([
    ['letters', '12a456'],
    ['5 digits', '12345'],
    ['7 digits', '1234567'],
    ['surrounding spaces', ' 123456'],
    ['full-width digits', '１２３４５６'],
    ['empty', ''],
  ])('rejects a code with %s', (_label, otp) => {
    expect(messages(verify({ email: 'jane@example.com', otp }))).toEqual([OTP_ERROR]);
  });

  it('rejects a numeric JSON value (the code must be a string)', () => {
    expect(messages(verify({ email: 'jane@example.com', otp: 123456 }))).toEqual([OTP_ERROR]);
  });

  it('requires the code', () => {
    expect(messages(verify({ email: 'jane@example.com' }))).toEqual([OTP_ERROR]);
  });
});

describe('reset body — new password uses the existing registration rules', () => {
  it('accepts a valid new password with matching confirmation', () => {
    expect(reset({}).success).toBe(true);
  });

  it.each(['password123', 'Password!', '123456789!', 'Pass1!', '         '])(
    'rejects %j with exactly the registration (newPasswordSchema) message',
    (password) => {
      const expected = messages(newPasswordSchema.safeParse(password));
      expect(expected).toHaveLength(1);
      expect(messages(reset({ newPassword: password, confirmPassword: password }))).toEqual(expected);
    }
  );

  it('rejects a password over 72 UTF-8 bytes', () => {
    const password = `Aa1!${'é'.repeat(35)}`;
    expect(messages(reset({ newPassword: password, confirmPassword: password }))[0]).toMatch(/^Password is too long/);
  });

  it('rejects a confirmation mismatch on confirmPassword', () => {
    const result = reset({ confirmPassword: 'Different123!' });
    expect(messages(result)).toEqual(['Passwords do not match.']);
    expect(result.error.issues[0].path).toEqual(['confirmPassword']);
  });

  it('requires the confirmation', () => {
    expect(messages(reset({ confirmPassword: undefined }))).toEqual(['Confirm your new password.']);
  });

  it('never trims or changes the password', () => {
    const password = '  NewPass 123!  ';
    expect(reset({ newPassword: password, confirmPassword: password }).data.newPassword).toBe(password);
  });
});
