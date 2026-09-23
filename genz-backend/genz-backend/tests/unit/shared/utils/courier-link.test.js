/**
 * courier-link.test.js
 * Signed courier tokens: HMAC-SHA256 of the delivery ID with COURIER_LINK_SECRET,
 * tied to one delivery, verified in constant time, never stored.
 */

const crypto = require('crypto');
const config = require('../../../../src/config/env.config');
const { createCourierToken, verifyCourierToken, courierLinkFor } = require('../../../../src/shared/utils/courier-link');

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

describe('createCourierToken()', () => {
  it('is a 43-character base64url HMAC-SHA256 of "courier-link:v1:<deliveryId>" keyed with COURIER_LINK_SECRET', () => {
    const expected = crypto.createHmac('sha256', config.courierLink.secret).update('courier-link:v1:1').digest('base64url');
    expect(createCourierToken(1)).toBe(expected);
    expect(createCourierToken(1)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('is deterministic (nothing is stored) and different for every delivery', () => {
    expect(createCourierToken(1)).toBe(createCourierToken(1));
    const tokens = new Set([1, 2, 3, 10, 11, 100].map(createCourierToken));
    expect(tokens.size).toBe(6);
  });

  it('never contains the secret', () => {
    expect(createCourierToken(1)).not.toContain(config.courierLink.secret);
  });
});

describe('verifyCourierToken()', () => {
  const token1 = createCourierToken(1);

  it('accepts the token for its own delivery (number or string ID)', () => {
    expect(verifyCourierToken(1, token1)).toBe(true);
    expect(verifyCourierToken('1', token1)).toBe(true);
  });

  it("rejects delivery 1's token for any other delivery", () => {
    for (const other of [2, 10, 11, 21, '01']) {
      expect(verifyCourierToken(other, token1)).toBe(false);
    }
  });

  it('rejects a random token', () => {
    expect(verifyCourierToken(1, crypto.randomBytes(32).toString('base64url'))).toBe(false);
  });

  it('rejects the token with ANY single character changed (including unused bits of the last character)', () => {
    for (let i = 0; i < token1.length; i += 1) {
      for (const c of BASE64URL) {
        if (c !== token1[i]) {
          expect(verifyCourierToken(1, token1.slice(0, i) + c + token1.slice(i + 1))).toBe(false);
        }
      }
    }
  });

  it('rejects a token signed with a different secret', () => {
    const forged = crypto.createHmac('sha256', 'some-other-secret-that-is-long-enough!!').update('courier-link:v1:1').digest('base64url');
    expect(verifyCourierToken(1, forged)).toBe(false);
  });

  it.each([undefined, null, '', ' ', 123, ['x'], `${createCourierToken(1)} `, `${createCourierToken(1)}=`])(
    'rejects a missing or malformed token %j',
    (value) => {
      expect(verifyCourierToken(1, value)).toBe(false);
    }
  );

  it('compares with crypto.timingSafeEqual (constant time)', () => {
    const spy = jest.spyOn(crypto, 'timingSafeEqual');
    verifyCourierToken(1, token1);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('courierLinkFor()', () => {
  it('returns the token and the Delivery Tracking page path that carries it', () => {
    const token = createCourierToken(5);
    expect(courierLinkFor(5)).toEqual({ courierToken: token, courierPath: `/delivery-tracking/5?token=${token}` });
  });
});
