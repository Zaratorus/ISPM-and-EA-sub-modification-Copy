const { z } = require('zod');

const createRoleSchema = {
  body: z.object({
    name: z.string().trim().min(1).max(100),
  }),
};

const roleIdParamSchema = {
  params: z.object({ id: z.coerce.number().int().positive() }),
};

// POST /roles/:id/permissions — "assign permission(s)": one or more.
const assignPermissionsSchema = {
  params: z.object({ id: z.coerce.number().int().positive() }),
  body: z.object({
    permissionIds: z.array(z.coerce.number().int().positive()).min(1),
  }),
};

module.exports = { createRoleSchema, roleIdParamSchema, assignPermissionsSchema };
