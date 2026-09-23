const { z } = require('zod');

const deliveryIdParamSchema = {
  params: z.object({ id: z.coerce.number().int().positive() }),
};

const orderIdParamSchema = {
  params: z.object({ id: z.coerce.number().int().positive() }),
};

// POST /deliveries — Admin. deliveryPersonReference is optional and
// unconstrained (OPEN item 10 — Delivery Person identity — is not
// resolved by this validator; it just accepts a free-text string if given).
const createDeliverySchema = {
  body: z.object({
    orderId: z.coerce.number().int().positive(),
    deliveryPersonReference: z.string().trim().min(1).max(150).optional(),
  }),
};

// Target states only — ASSIGNED is the starting state set at creation, not
// something advanced TO. Expanded 6-stage ladder (project-owner decision,
// 2026-09-12): Assigned -> Heading to Store -> Picked Up -> Out for
// Delivery -> Arrived -> Delivered. Reachable only via the public
// Delivery Person routes (see delivery.routes.js) — Admin no longer
// advances delivery status at all.
const advanceDeliveryStatusSchema = {
  params: z.object({ id: z.coerce.number().int().positive() }),
  body: z.object({
    status: z.enum(['HEADING_TO_STORE', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVED', 'DELIVERED']),
  }),
};

module.exports = { deliveryIdParamSchema, orderIdParamSchema, createDeliverySchema, advanceDeliveryStatusSchema };
