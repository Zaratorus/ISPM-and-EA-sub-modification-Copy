const { z } = require('zod');

const createCategorySchema = {
  body: z.object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).optional(),
  }),
};

const updateCategorySchema = {
  params: z.object({ id: z.coerce.number().int().positive() }),
  body: z.object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).optional(),
  }),
};

module.exports = { createCategorySchema, updateCategorySchema };
