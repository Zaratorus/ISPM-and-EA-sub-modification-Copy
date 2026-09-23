const ApiError = require('../../../src/shared/utils/ApiError');

describe('ApiError', () => {
  it('conflict() produces a 409 with the given code and message', () => {
    const err = ApiError.conflict('INSUFFICIENT_STOCK', 'not enough stock');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('INSUFFICIENT_STOCK');
    expect(err.message).toBe('not enough stock');
    expect(err).toBeInstanceOf(Error);
  });

  it('notFound() produces a 404', () => {
    const err = ApiError.notFound('PRODUCT_NOT_FOUND', 'no such product');
    expect(err.statusCode).toBe(404);
  });
});
