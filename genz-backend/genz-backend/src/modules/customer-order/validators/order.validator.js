const { z } = require('zod');

const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'PROCESSING', 'READY_FOR_DELIVERY', 'CANCELLED'];

const orderIdParamSchema = {
  params: z.object({ id: z.coerce.number().int().positive() }),
};

// POST /orders — checkout. deliveryAddress is required (project-owner
// amendment resolving the EP-03 delivery-address schema gap): captured
// once here, stored on the Order, later snapshotted onto Delivery at the
// Ready-for-Delivery handover — never re-read live from Customer.
const checkoutSchema = {
  body: z.object({
    deliveryAddress: z.string().trim().min(1).max(500),
  }),
};

const listOrdersQuerySchema = {
  query: z.object({
    status: z.enum(ORDER_STATUSES).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
};

// PATCH /orders/:id/status — only the two forward, non-automatic
// transitions this endpoint owns (Confirmed->Processing->Ready for
// Delivery). Pending->Confirmed is a separate endpoint (/confirm).
const advanceStatusSchema = {
  params: z.object({ id: z.coerce.number().int().positive() }),
  body: z.object({
    status: z.enum(['PROCESSING', 'READY_FOR_DELIVERY']),
  }),
};

module.exports = { orderIdParamSchema, checkoutSchema, listOrdersQuerySchema, advanceStatusSchema };
