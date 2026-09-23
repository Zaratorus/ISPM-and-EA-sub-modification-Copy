/**
 * customer.validator.test.js
 * Password strength rules (new registrations only), the 72-byte bcrypt limit,
 * contact-info validation/normalisation (email or phone), and login
 * compatibility for customers whose passwords predate the new rules.
 * Pure schema tests: no network, no database, no timers.
 */

const {
  registerSchema,
  loginSchema,
  PASSWORD_MIN_CHARS,
  PASSWORD_MAX_BYTES,
} = require('../../../../../src/modules/customer-order/validators/customer.validator');

const VALID = { name: 'Jane Doe', contactInfo: 'jane@example.com', password: 'Password123!' };

function register(overrides) {
  return registerSchema.body.safeParse({ ...VALID, ...overrides });
}
function login(body) {
  return loginSchema.body.safeParse(body);
}
function messages(result) {
  return result.success ? [] : result.error.issues.map((i) => i.message);
}

describe('registration password rules', () => {
  it('uses a 9-character minimum and a 72-byte maximum', () => {
    expect(PASSWORD_MIN_CHARS).toBe(9);
    expect(PASSWORD_MAX_BYTES).toBe(72);
  });

  it.each(['Password123!', 'MyStore@2026'])('accepts the documented valid example %s', (password) => {
    expect(register({ password }).success).toBe(true);
  });

  it.each([
    ['password123', 'Password must contain at least one special character.'],
    ['Password!', 'Password must contain at least one number.'],
    ['123456789!', 'Password must contain at least one letter.'],
    ['Pass1!', 'Password must be at least 9 characters.'],
  ])('rejects the documented invalid example %s', (password, message) => {
    expect(messages(register({ password }))).toEqual([message]);
  });

  it('1. rejects an 8-character password', () => {
    expect(messages(register({ password: 'Abcde12!' }))).toEqual(['Password must be at least 9 characters.']);
  });

  it('2. accepts a 9-character password that meets every rule', () => {
    expect(register({ password: 'Abcdef12!' }).success).toBe(true);
  });

  it('3. rejects a password with no letter', () => {
    expect(messages(register({ password: '12345678#$' }))).toEqual(['Password must contain at least one letter.']);
  });

  it('4. rejects a password with no number', () => {
    expect(messages(register({ password: 'Abcdefgh!' }))).toEqual(['Password must contain at least one number.']);
  });

  it('5. rejects a password with no special character', () => {
    expect(messages(register({ password: 'Abcdefgh1' }))).toEqual([
      'Password must contain at least one special character.',
    ]);
  });

  it('5b. does not count a space as the special character', () => {
    expect(messages(register({ password: 'Abcd efgh1' }))).toEqual([
      'Password must contain at least one special character.',
    ]);
  });

  it.each(['          ', '\t\t\t\t\t\t\t\t\t\t', ' '])('6. rejects a whitespace-only password %j', (password) => {
    expect(messages(register({ password }))).toEqual(['Password cannot contain only whitespace.']);
  });

  it('rejects an empty or missing password', () => {
    expect(messages(register({ password: '' }))).toEqual(['Password is required.']);
    const { password, ...noPassword } = VALID;
    expect(messages(registerSchema.body.safeParse(noPassword))).toEqual(['Password is required.']);
  });

  it('7. accepts spaces inside a password that meets every rule', () => {
    expect(register({ password: 'My Store 2026!' }).success).toBe(true);
  });

  it('8. rejects a password over 72 UTF-8 bytes (ASCII)', () => {
    const password = `Aa1!${'x'.repeat(69)}`; // 73 bytes
    expect(Buffer.byteLength(password, 'utf8')).toBe(73);
    expect(messages(register({ password }))[0]).toMatch(/^Password is too long/);
  });

  it('8b. counts bytes, not characters: 39 characters but 74 bytes is rejected', () => {
    const password = `Aa1!${'é'.repeat(35)}`; // é is 2 bytes in UTF-8
    expect(password.length).toBe(39);
    expect(Buffer.byteLength(password, 'utf8')).toBe(74);
    expect(messages(register({ password }))[0]).toMatch(/^Password is too long/);
  });

  it('9. accepts exactly 72 UTF-8 bytes (ASCII and multi-byte)', () => {
    const ascii = `Aa1!${'x'.repeat(68)}`;
    const unicode = `Aa1!${'é'.repeat(34)}`;
    expect(Buffer.byteLength(ascii, 'utf8')).toBe(72);
    expect(Buffer.byteLength(unicode, 'utf8')).toBe(72);
    expect(register({ password: ascii }).success).toBe(true);
    expect(register({ password: unicode }).success).toBe(true);
  });

  it('10. returns the password exactly as typed (no trimming or other changes)', () => {
    const password = '  My Store 2026!  ';
    const result = register({ password });
    expect(result.success).toBe(true);
    expect(result.data.password).toBe(password);
  });
});

describe('contact info (email or phone)', () => {
  const contact = (contactInfo) => register({ contactInfo });

  it('11. accepts a valid email', () => {
    expect(contact('jane@example.com').data.contactInfo).toBe('jane@example.com');
  });

  it('12. lowercases an email', () => {
    expect(contact('Jane.Doe@Example.COM').data.contactInfo).toBe('jane.doe@example.com');
  });

  it('13. trims spaces around an email', () => {
    expect(contact('   jane@example.com  ').data.contactInfo).toBe('jane@example.com');
  });

  it.each(['jane@', '@example.com', 'jane@@example.com', 'jane doe@example.com', 'jane@example'])(
    '14. rejects the invalid email %j',
    (value) => {
      expect(messages(contact(value))).toEqual(['Enter a valid email address or phone number.']);
    }
  );

  it('15. accepts a phone number with a leading + and keeps the +', () => {
    expect(contact('+94771234567').data.contactInfo).toBe('+94771234567');
  });

  it.each([
    ['+94 77 123 4567', '+94771234567'],
    ['+94-77-123-4567', '+94771234567'],
    ['  077 123-4567 ', '0771234567'],
  ])('16. normalises the phone number %j to %j', (value, normalised) => {
    expect(contact(value).data.contactInfo).toBe(normalised);
  });

  it.each([
    ['too few digits', '12345678'],
    ['too many digits', '+1234567890123456'],
    ['+ not at the start', '94+771234567'],
    ['letters inside', '077-ABC-4567'],
    ['other punctuation', '(077) 123 4567'],
  ])('17. rejects an invalid phone number (%s)', (_label, value) => {
    expect(messages(contact(value))).toEqual(['Enter a valid email address or phone number.']);
  });

  it.each(['abc', '', '   '])('18. rejects the completely invalid contact %j', (value) => {
    expect(messages(contact(value))).toEqual(['Enter a valid email address or phone number.']);
  });

  it('uses the same normalisation at login', () => {
    expect(login({ contactInfo: '  Jane@Example.COM ', password: 'x' }).data.contactInfo).toBe('jane@example.com');
    expect(login({ contactInfo: '+94 77-123 4567', password: 'x' }).data.contactInfo).toBe('+94771234567');
    expect(messages(login({ contactInfo: 'abc', password: 'x' }))).toEqual([
      'Enter a valid email address or phone number.',
    ]);
  });
});

describe('login compatibility with existing customers', () => {
  it.each(['password123', 'short', 'Password!', '12345678', '        '])(
    '19/20. accepts the old-style password %j at login (strength rules are not applied)',
    (password) => {
      const result = login({ contactInfo: 'jane@example.com', password });
      expect(result.success).toBe(true);
      expect(result.data.password).toBe(password);
    }
  );

  it('still rejects an empty password at login', () => {
    expect(messages(login({ contactInfo: 'jane@example.com', password: '' }))).toEqual(['Password is required.']);
  });
});

describe('registration regression', () => {
  it('21. the updated test password Password123! meets the new rules; the old password123 does not', () => {
    expect(register({ password: 'Password123!' }).success).toBe(true);
    expect(register({ password: 'password123' }).success).toBe(false);
  });
});
