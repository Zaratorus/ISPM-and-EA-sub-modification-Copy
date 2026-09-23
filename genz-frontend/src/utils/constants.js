// Mirrors src/shared/constants/statuses.js in genz-backend exactly — the
// single source of truth for every ENUM value. Never invent a status here
// that doesn't exist server-side.

export const ORDER_STATUS_LABELS = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PROCESSING: "Processing",
  READY_FOR_DELIVERY: "Ready for Delivery",
  CANCELLED: "Cancelled",
};

export const ORDER_STATUS_TONE = {
  PENDING: "warning",
  CONFIRMED: "info",
  PROCESSING: "info",
  READY_FOR_DELIVERY: "success",
  CANCELLED: "error",
};

// 6-stage ladder (project-owner decision, 2026-09-12 — added Heading to
// Store and Arrived for finer-grained tracking).
export const DELIVERY_STATUS_LABELS = {
  ASSIGNED: "Assigned",
  HEADING_TO_STORE: "Heading to Store",
  PICKED_UP: "Picked Up",
  OUT_FOR_DELIVERY: "Out for Delivery",
  ARRIVED: "Arrived",
  DELIVERED: "Delivered",
};

// Next stage in the ladder, keyed by current status — mirrors
// ALLOWED_TRANSITIONS in delivery.service.js exactly. Shared by the
// Delivery Person tracking page (the only place that can still advance a
// delivery) and any read-only status display.
export const NEXT_DELIVERY_STATUS = {
  ASSIGNED: "HEADING_TO_STORE",
  HEADING_TO_STORE: "PICKED_UP",
  PICKED_UP: "OUT_FOR_DELIVERY",
  OUT_FOR_DELIVERY: "ARRIVED",
  ARRIVED: "DELIVERED",
};

export const MODERATION_STATUS_LABELS = {
  PENDING_MODERATION: "Pending Moderation",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  DELETED: "Removed",
};

export const MODERATION_STATUS_TONE = {
  PENDING_MODERATION: "warning",
  APPROVED: "success",
  REJECTED: "error",
  DELETED: "neutral",
};

// Moderation actions allowed from each status — mirrors
// ALLOWED_MODERATION_ACTIONS in review.service.js (the backend stays the
// source of truth; this only decides which buttons to show).
export const MODERATION_ACTIONS_BY_STATUS = {
  PENDING_MODERATION: ["APPROVE", "REJECT", "DELETE"],
  APPROVED: ["DELETE"],
  REJECTED: ["APPROVE", "DELETE"],
  DELETED: [],
};

export const AVAILABILITY_LABELS = {
  IN_STOCK: "In Stock",
  OUT_OF_STOCK: "Out of Stock",
};
