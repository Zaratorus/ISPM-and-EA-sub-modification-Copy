const { z } = require('zod');

// credentials_reference is deliberately NOT accepted by this validator —
// the Staff authentication mechanism is OPEN (Backend/API Architecture
// Design V1.0, Section 15 item 1). A Staff row can be created with a name
// and role now; setting a real credential is deferred until that decision
// is made, whatever shape it turns out to need.

const createStaffSchema = {
  body: z.object({
    name: z.string().trim().min(1).max(150),
    roleId: z.coerce.number().int().positive(),
  }),
};

const staffIdParamSchema = {
  params: z.object({ id: z.coerce.number().int().positive() }),
};

const updateStaffSchema = {
  params: z.object({ id: z.coerce.number().int().positive() }),
  body: z.object({
    name: z.string().trim().min(1).max(150).optional(),
    roleId: z.coerce.number().int().positive().optional(),
  }),
};

module.exports = { createStaffSchema, staffIdParamSchema, updateStaffSchema };
