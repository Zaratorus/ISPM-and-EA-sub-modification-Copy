const { z } = require('zod');

const searchProductsSchema = {
  query: z.object({
    categoryId: z.coerce.number().int().positive().optional(),
    name: z.string().trim().min(1).max(150).optional(),
    brand: z.string().trim().min(1).max(100).optional(),
    variant: z.string().trim().min(1).max(20).optional(),
    minPrice: z.coerce.number().positive().optional(),
    maxPrice: z.coerce.number().positive().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
};

const productIdParamSchema = {
  params: z.object({ id: z.coerce.number().int().positive() }),
};

// price > 0 mirrors the database CHECK constraint (Physical Schema Design V1.0,
// Section 5) — enforced here too for a fast, clear client-facing error.
const createProductSchema = {
  body: z.object({
    categoryId: z.coerce.number().int().positive(),
    name: z.string().trim().min(1).max(150),
    description: z.string().trim().max(5000).optional(),
    price: z.coerce.number().positive(),
    brand: z.string().trim().min(1).max(100).optional(),
  }),
};

const updateProductSchema = {
  params: z.object({ id: z.coerce.number().int().positive() }),
  body: z.object({
    categoryId: z.coerce.number().int().positive().optional(),
    name: z.string().trim().min(1).max(150).optional(),
    description: z.string().trim().max(5000).optional(),
    price: z.coerce.number().positive().optional(),
    brand: z.string().trim().min(1).max(100).optional(),
  }),
};

const adjustStockSchema = {
  params: z.object({ id: z.coerce.number().int().positive() }),
  body: z.object({
    newQuantity: z.coerce.number().int().min(0),
    reason: z.string().trim().min(1).max(500),
  }),
};

const addImageSchema = {
  params: z.object({ id: z.coerce.number().int().positive() }),
  body: z.object({
    imageReference: z.string().trim().min(1).max(500),
    sortOrder: z.coerce.number().int().min(0).optional(),
  }),
};

module.exports = {
  searchProductsSchema,
  productIdParamSchema,
  createProductSchema,
  updateProductSchema,
  adjustStockSchema,
  addImageSchema,
};
