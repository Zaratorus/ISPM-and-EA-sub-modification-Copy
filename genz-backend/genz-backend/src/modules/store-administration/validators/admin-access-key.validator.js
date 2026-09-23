const { z } = require('zod');

const validateAccessKeySchema = {
  body: z.object({
    accessKey: z.string().min(1).max(255),
  }),
};

module.exports = { validateAccessKeySchema };
