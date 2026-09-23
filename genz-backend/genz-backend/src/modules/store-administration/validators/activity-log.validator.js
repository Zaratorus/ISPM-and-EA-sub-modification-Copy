const { z } = require('zod');

const listActivityLogQuerySchema = {
  query: z.object({
    originatingModule: z.enum(['A', 'B', 'C', 'D']).optional(),
    actionType: z.string().trim().min(1).max(100).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
};

module.exports = { listActivityLogQuerySchema };
