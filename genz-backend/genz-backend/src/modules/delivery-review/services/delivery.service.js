/**
 * delivery.service.js
 * Owning module: C (EP-03). Delivery status ownership is exclusively
 * Module C's (Detailed System Architecture V1.2, Section 11: "no other
 * module writes to delivery status").
 *
 * Delivery CREATION (`createDelivery`) reads the delivery address from
 * Module B's exposed order.service.js.getOrderDetail() — a SNAPSHOT of
 * `orders.delivery_address`, itself captured once at checkout (project-
 * owner amendment resolving the previously-blocked EP-03 delivery-address
 * schema gap). This is read once, at handover, and copied into Delivery's
 * own `delivery_address` column — never a live link back to Order or
 * Customer thereafter.
 */

const { withTransaction } = require('../../../shared/db/connection');
const ApiError = require('../../../shared/utils/ApiError');
const { DELIVERY_STATUS, ORDER_STATUS } = require('../../../shared/constants/statuses');
const deliveryRepository = require('../repositories/delivery.repository');
const orderService = require('../../customer-order/services/order.service');
const activityLogService = require('../../store-administration/services/activity-log.service');

function toDeliveryDTO(row, history) {
  return {
    deliveryId: row.delivery_id,
    orderId: row.order_id,
    deliveryAddress: row.delivery_address,
    deliveryPersonReference: row.delivery_person_reference,
    status: row.status,
    assignedAt: row.assigned_at,
    // Full transition timeline — "what happened through the process" for
    // both Admin and the Customer, not just the current status (project-
    // owner decision, 2026-09-12).
    history: history.map((h) => ({
      fromStatus: h.from_status,
      toStatus: h.to_status,
      actorReference: h.actor_reference,
      changedAt: h.changed_at,
    })),
  };
}

async function getDeliveryById(deliveryId) {
  const delivery = await deliveryRepository.findById(deliveryId);
  if (!delivery) {
    throw ApiError.notFound('DELIVERY_NOT_FOUND', `Delivery ${deliveryId} does not exist.`);
  }
  const history = await deliveryRepository.findStatusHistory(delivery.delivery_id);
  return toDeliveryDTO(delivery, history);
}

async function getDeliveryByOrderId(orderId) {
  const delivery = await deliveryRepository.findByOrderId(orderId);
  if (!delivery) {
    throw ApiError.notFound('DELIVERY_NOT_FOUND', `No delivery exists yet for order ${orderId}.`);
  }
  const history = await deliveryRepository.findStatusHistory(delivery.delivery_id);
  return toDeliveryDTO(delivery, history);
}

/**
 * POST /deliveries — Admin. Documented as "system-triggered at Ready-for-
 * Delivery handover, exposed here for admin-initiated assignment"
 * (Backend/API Architecture Design V1.0, Section 6). Creates the Delivery
 * record referencing the Order and snapshotting its delivery address at
 * this exact moment (System Architecture V1.2, Section 11: "Delivery
 * creation occurs the moment an order transitions to Ready for Delivery
 * ... Module C reads the necessary order/customer/address information
 * from Module B at this point"). `deliveryPersonReference` is optional and
 * passed through as an unconstrained string if given — no Delivery Person
 * auth mechanism, role, or entity is invented (OPEN item 10).
 */
async function createDelivery({ orderId, deliveryPersonReference }, actor) {
  const order = await orderService.getOrderDetail(orderId);
  if (order.status !== 'READY_FOR_DELIVERY') {
    throw ApiError.unprocessable(
      'ORDER_NOT_READY_FOR_DELIVERY',
      `Order ${orderId} must be Ready for Delivery before a Delivery record can be created (current status: ${order.status}).`
    );
  }

  const existing = await deliveryRepository.findByOrderId(orderId);
  if (existing) {
    throw ApiError.conflict('DELIVERY_ALREADY_EXISTS', `A Delivery record already exists for order ${orderId}.`);
  }

  const delivery = await deliveryRepository.create({
    orderId,
    deliveryAddress: order.deliveryAddress,
    deliveryPersonReference: deliveryPersonReference ?? null,
  });

  await activityLogService.logActivity({
    actorType: actor.actorType,
    actorId: actor.actorId,
    actionType: 'DELIVERY_CREATED',
    affectedEntityType: 'Delivery',
    affectedEntityId: delivery.delivery_id,
    originatingModule: 'C',
  });

  // Freshly created — no transitions recorded yet, so no repository round
  // trip is needed to know the history is empty.
  return toDeliveryDTO(delivery, []);
}

/**
 * Ownership check for GET /deliveries/:id and GET /orders/:id/delivery
 * (Customer own / Admin). Reads Order data via Module B's exposed
 * order.service.js.getOrderDetail() — never a direct read of Module B's
 * `orders` table from this module's repository (Backend/API Architecture
 * Design V1.0, Section 13).
 */
async function assertCustomerOwnsDelivery(deliveryDto, customerId) {
  const order = await orderService.getOrderDetail(deliveryDto.orderId);
  if (order.customerId !== customerId) {
    throw ApiError.forbidden('FORBIDDEN', "You cannot view another customer's delivery.");
  }
}

/**
 * Read for Module B's order.service.js.cancelOrder(): a Delivered order can no
 * longer be cancelled. Returns the delivery status for the order, or null when
 * no delivery exists yet.
 */
async function getDeliveryStatusForOrder(orderId) {
  const delivery = await deliveryRepository.findByOrderId(orderId);
  return delivery ? delivery.status : null;
}

// Target states only — Assigned is the starting state, not something
// advanced TO. Expanded to 6 stages (project-owner decision, 2026-09-12):
// Assigned -> Heading to Store -> Picked Up -> Out for Delivery -> Arrived
// -> Delivered.
const ALLOWED_TRANSITIONS = {
  [DELIVERY_STATUS.ASSIGNED]: DELIVERY_STATUS.HEADING_TO_STORE,
  [DELIVERY_STATUS.HEADING_TO_STORE]: DELIVERY_STATUS.PICKED_UP,
  [DELIVERY_STATUS.PICKED_UP]: DELIVERY_STATUS.OUT_FOR_DELIVERY,
  [DELIVERY_STATUS.OUT_FOR_DELIVERY]: DELIVERY_STATUS.ARRIVED,
  [DELIVERY_STATUS.ARRIVED]: DELIVERY_STATUS.DELIVERED,
};

/**
 * The Delivery Person's view of a delivery (GET/PATCH /deliveries/:id/courier...):
 * only what the Delivery Tracking page needs. Internal audit detail (history
 * actor references and from-statuses) and the delivery person reference are
 * left out; nextStatus tells the page which stage the courier can mark next.
 */
function toCourierDelivery(dto) {
  return {
    deliveryId: dto.deliveryId,
    orderId: dto.orderId,
    deliveryAddress: dto.deliveryAddress,
    status: dto.status,
    nextStatus: ALLOWED_TRANSITIONS[dto.status] || null,
    assignedAt: dto.assignedAt,
    history: dto.history.map((h) => ({ toStatus: h.toStatus, changedAt: h.changedAt })),
  };
}

/**
 * PATCH /deliveries/:id/courier/status — Delivery Person only.
 *
 * Project-owner decision (2026-09-12) RESOLVING the previously-OPEN
 * Delivery Person identity question (Backend/API Architecture Design
 * V1.0, Section 15 item 10 / Logical Database Design V1.1's "Additional
 * Note on Delivery Person"): the Delivery Person has no account. Access to
 * one delivery is granted by the signed courier link the Admin shares (an
 * HMAC of the delivery ID, checked by auth-courier-link.middleware.js before
 * this function runs) — the delivery ID alone is not enough.
 *
 * A second, matching decision: once a Delivery has been created, the
 * Admin can no longer advance its status at all — routes/delivery.routes.js
 * no longer exposes an Admin-authenticated status-advance endpoint. Admin
 * involvement ends at creation/assignment (createDelivery below); this
 * function is reachable only via the courier-link-protected Delivery Person route.
 */
function deliveryStatusChanged() {
  return ApiError.conflict('DELIVERY_STATUS_CHANGED', 'This delivery was just updated — refresh and try again.');
}

async function advanceStatus(deliveryId, targetStatus) {
  // Everything runs in ONE transaction on the locked delivery row, so
  // concurrent requests for the same delivery are serialized: a second
  // request waits for the first to commit, then sees the status it committed.
  // Any thrown error rolls back the update, history row and activity log together.
  await withTransaction(async (conn) => {
    const delivery = await deliveryRepository.findByIdForUpdate(deliveryId, conn);
    if (!delivery) {
      throw ApiError.notFound('DELIVERY_NOT_FOUND', `Delivery ${deliveryId} does not exist.`);
    }
    // A delivery whose order has been Cancelled is frozen: it keeps its current
    // status (nothing is deleted or rewritten) but can never advance again.
    const order = await orderService.getOrderDetail(delivery.order_id);
    if (order.status === ORDER_STATUS.CANCELLED) {
      throw ApiError.unprocessable(
        'ORDER_CANCELLED',
        `Order ${delivery.order_id} has been cancelled, so delivery ${deliveryId} can no longer be updated.`
      );
    }
    // The requested stage is already the current one: another request (double
    // submit, second tab, retry) has just applied this same transition.
    if (delivery.status === targetStatus) {
      throw deliveryStatusChanged();
    }
    const expectedTarget = ALLOWED_TRANSITIONS[delivery.status];
    if (expectedTarget !== targetStatus) {
      throw ApiError.unprocessable(
        'INVALID_DELIVERY_TRANSITION',
        `Delivery ${deliveryId} cannot move from ${delivery.status} to ${targetStatus}.`
      );
    }

    // Defense in depth: the UPDATE only applies while the status is still the
    // one validated above; 0 affected rows means it changed underneath us.
    const affectedRows = await deliveryRepository.updateStatus(deliveryId, targetStatus, delivery.status, conn);
    if (affectedRows === 0) {
      throw deliveryStatusChanged();
    }

    // Free-text, sourced from the reference the Admin recorded at creation
    // (deliveries.delivery_person_reference) — the closest thing to an actor
    // identity this unauthenticated actor has.
    const actorReference = delivery.delivery_person_reference || 'Delivery Person (unidentified)';
    await deliveryRepository.addStatusHistory(
      { deliveryId, fromStatus: delivery.status, toStatus: targetStatus, actorReference },
      conn
    );

    // activity_log.actor_type only accepts STAFF_ADMIN_USER/OWNER_ADMIN/SYSTEM
    // (activity-log.service.js's VALID_ACTOR_TYPES) — same constraint already
    // hit and fixed for Customer actors in order.service.js/review.service.js.
    // A Delivery Person can't be represented there either, so actorType/
    // actorId stay null; the contextNote carries the same free-text reference
    // written to delivery_status_history.actor_reference above. Written on the
    // transaction connection, so it commits or rolls back with the update.
    await activityLogService.logActivity(
      {
        actorType: null,
        actorId: null,
        actionType: `DELIVERY_STATUS_${targetStatus}`,
        affectedEntityType: 'Delivery',
        affectedEntityId: deliveryId,
        originatingModule: 'C',
        contextNote: `Advanced by ${actorReference}.`,
      },
      conn
    );
  });

  // Note: reaching DELIVERED does not push anything to review.service.js —
  // review eligibility is checked internally by Module C at review-
  // submission time (System Architecture V1.2, Section 11: "Module C
  // determines eligibility internally ... does not require [a] push").

  return getDeliveryById(deliveryId);
}

module.exports = {
  getDeliveryById,
  getDeliveryByOrderId,
  createDelivery,
  assertCustomerOwnsDelivery,
  advanceStatus,
  toCourierDelivery,
  getDeliveryStatusForOrder,
};
