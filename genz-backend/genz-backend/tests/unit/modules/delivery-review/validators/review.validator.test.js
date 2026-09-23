/**
 * review.validator.test.js
 * Review field rules: a strict integer rating 1-5 (never coerced), trimmed
 * text of at most 2000 characters with empty text stored as NULL, strict
 * customer edits (only rating/reviewText, at least one), and the admin
 * moderation-status filter. Pure schema tests.
 */

const {
  submitReviewSchema,
  updateReviewSchema,
  reviewIdParamSchema,
  myReviewsQuerySchema,
  moderationQueueQuerySchema,
} = require('../../../../../src/modules/delivery-review/validators/review.validator');

const RATING_MESSAGE = 'Rating must be a whole number from 1 to 5.';
const submit = (overrides) => submitReviewSchema.body.safeParse({ orderId: 100, productId: 5, rating: 4, ...overrides });
const edit = (body) => updateReviewSchema.body.safeParse(body);
const messages = (result) => (result.success ? [] : result.error.issues.map((i) => i.message));

describe('rating — a real integer from 1 to 5, never coerced', () => {
  it.each([1, 2, 3, 4, 5])('15. accepts %i on submit and on edit', (rating) => {
    expect(submit({ rating }).data.rating).toBe(rating);
    expect(edit({ rating }).data.rating).toBe(rating);
  });

  it.each([
    ['0', 0],
    ['6', 6],
    ['-1', -1],
    ['boolean true', true],
    ['boolean false', false],
    ['decimal 4.5', 4.5],
    ['numeric string "4"', '4'],
    ['null', null],
    ['an array', [4]],
  ])('15/16/17. rejects %s on submit and on edit', (_label, rating) => {
    expect(messages(submit({ rating }))).toEqual([RATING_MESSAGE]);
    expect(messages(edit({ rating }))).toEqual([RATING_MESSAGE]);
  });

  it('requires a rating when submitting', () => {
    expect(messages(submit({ rating: undefined }))).toEqual(['Rating is required.']);
  });
});

describe('review text — trimmed, at most 2000 characters, empty becomes NULL', () => {
  it('18. trims surrounding whitespace', () => {
    expect(submit({ reviewText: '  Great fit  ' }).data.reviewText).toBe('Great fit');
    expect(edit({ reviewText: '\n Great fit \t' }).data.reviewText).toBe('Great fit');
  });

  it.each(['', '   ', '\n\t '])('19. turns empty/whitespace-only text %j into null', (reviewText) => {
    expect(submit({ reviewText }).data.reviewText).toBeNull();
    expect(edit({ reviewText }).data.reviewText).toBeNull();
  });

  it('accepts null (clears the text) and leaves omitted text omitted', () => {
    expect(submit({ reviewText: null }).data.reviewText).toBeNull();
    expect(edit({ reviewText: null }).data.reviewText).toBeNull();
    expect(submit({}).data.reviewText).toBeUndefined();
  });

  it('accepts exactly 2000 characters (measured after trimming)', () => {
    const text = 'a'.repeat(2000);
    expect(submit({ reviewText: `  ${text}  ` }).data.reviewText).toBe(text);
    expect(edit({ reviewText: text }).success).toBe(true);
  });

  it('20. rejects more than 2000 characters', () => {
    const text = 'a'.repeat(2001);
    expect(messages(submit({ reviewText: text }))).toEqual(['Review text must be at most 2000 characters.']);
    expect(messages(edit({ reviewText: text }))).toEqual(['Review text must be at most 2000 characters.']);
  });

  it('rejects non-text values', () => {
    expect(messages(submit({ reviewText: 123 }))).toEqual(['Review text must be text.']);
  });
});

describe('customer edit body — only rating and reviewText, at least one of them', () => {
  it.each([
    [{ rating: 4, moderationStatus: 'APPROVED' }],
    [{ rating: 4, status: 'APPROVED' }],
    [{ rating: 4, customerId: 99 }],
    [{ reviewText: 'x', orderId: 1 }],
    [{ rating: 4, productId: 2 }],
    [{ moderationStatus: 'APPROVED' }],
  ])('13. rejects unknown fields %j', (body) => {
    const result = edit(body);
    expect(result.success).toBe(false);
    expect(result.error.issues.some((i) => i.code === 'unrecognized_keys')).toBe(true);
  });

  it('14. rejects an empty body', () => {
    expect(messages(edit({}))).toEqual(['Provide a rating and/or reviewText to update.']);
  });

  it('accepts a rating only, text only, or both', () => {
    expect(edit({ rating: 3 }).data).toEqual({ rating: 3 });
    expect(edit({ reviewText: 'Updated' }).data).toEqual({ reviewText: 'Updated' });
    expect(edit({ rating: 3, reviewText: 'Updated' }).data).toEqual({ rating: 3, reviewText: 'Updated' });
  });

  it('requires a positive integer review id', () => {
    expect(reviewIdParamSchema.params.safeParse({ id: '7' }).data).toEqual({ id: 7 });
    expect(reviewIdParamSchema.params.safeParse({ id: 'abc' }).success).toBe(false);
    expect(reviewIdParamSchema.params.safeParse({ id: '0' }).success).toBe(false);
  });
});

describe('list queries', () => {
  it('the admin list defaults to PENDING_MODERATION (the original queue)', () => {
    expect(moderationQueueQuerySchema.query.parse({})).toEqual({ page: 1, limit: 20, status: 'PENDING_MODERATION' });
  });

  it.each(['PENDING_MODERATION', 'APPROVED', 'REJECTED', 'DELETED'])('the admin list accepts status=%s', (status) => {
    expect(moderationQueueQuerySchema.query.parse({ status }).status).toBe(status);
  });

  it.each(['approved', 'ARCHIVED', ''])('the admin list rejects status=%j', (status) => {
    expect(moderationQueueQuerySchema.query.safeParse({ status }).success).toBe(false);
  });

  it('"my reviews" paging defaults and ignores unknown query fields such as customerId', () => {
    expect(myReviewsQuerySchema.query.parse({ customerId: '99' })).toEqual({ page: 1, limit: 20 });
  });
});
