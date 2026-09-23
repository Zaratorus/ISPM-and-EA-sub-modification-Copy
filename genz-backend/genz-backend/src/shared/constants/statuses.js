/**
 * statuses.js
 * Single source of truth for every lifecycle/status ENUM value used across
 * modules, mirrored exactly from Physical MySQL Database Schema Design V1.0
 * (Section 2/15 DDL). Services and validators import from here rather than
 * hardcoding string literals, so a status value is never spelled two
 * different ways in two different files.
 */

const PRODUCT_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  DISCONTINUED: 'DISCONTINUED',
});

const AVAILABILITY_STATUS = Object.freeze({
  IN_STOCK: 'IN_STOCK',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
});

const ORDER_STATUS = Object.freeze({
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  PROCESSING: 'PROCESSING',
  READY_FOR_DELIVERY: 'READY_FOR_DELIVERY',
  CANCELLED: 'CANCELLED',
});

// Project-owner decision (2026-09-12) expanding the delivery ladder from 4
// to 6 stages for finer-grained tracking, and resolving the previously-OPEN
// Delivery Person identity question (see delivery.service.js/routes.js):
// HEADING_TO_STORE and ARRIVED are the two added stages.
const DELIVERY_STATUS = Object.freeze({
  ASSIGNED: 'ASSIGNED',
  HEADING_TO_STORE: 'HEADING_TO_STORE',
  PICKED_UP: 'PICKED_UP',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  ARRIVED: 'ARRIVED',
  DELIVERED: 'DELIVERED',
});

const REVIEW_MODERATION_STATUS = Object.freeze({
  PENDING_MODERATION: 'PENDING_MODERATION',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  DELETED: 'DELETED',
});

module.exports = {
  PRODUCT_STATUS,
  AVAILABILITY_STATUS,
  ORDER_STATUS,
  DELIVERY_STATUS,
  REVIEW_MODERATION_STATUS,
};
