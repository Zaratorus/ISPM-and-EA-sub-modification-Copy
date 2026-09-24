const { z } = require('zod');

const addCartItemSchema = {
  body: z.object({
    productId: z.coerce.number().int().positive(),
    quantity: z.coerce.number().int().positive(),
    variantLabel: z.string().trim().min(1).max(20).optional(),
  }),
};

const cartItemIdParamSchema = {
  params: z.object({ id: z.coerce.number().int().positive() }),
};

const updateCartItemSchema = {
  params: z.object({ id: z.coerce.number().int().positive() }),
  body: z.object({
    quantity: z.coerce.number().int().positive(),
  }),
};

module.exports = { addCartItemSchema, cartItemIdParamSchema, updateCartItemSchema };
