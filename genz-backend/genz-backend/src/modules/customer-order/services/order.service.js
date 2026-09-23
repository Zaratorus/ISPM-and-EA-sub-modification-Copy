/**
 * order.service.js
 * Owning module: B (EP-02). Order lifecycle from checkout through Pending
 * -> Confirmed -> Processing -> Ready for Delivery (Detailed System
 * Architecture V1.2, Section 9). Stock is never written directly here —
 * every mutation goes through Module A's inventory.service.js
 * (decreaseStock/increaseStock), per the absolute EP-01 ownership rule
 * (Backend/API Architecture Design V1.0, Section 2 Principle 3).
 *
 * PATCH /orders/:id/cancel is cancelOrder() below: a Customer may cancel
 * only their own Pending order; Admin may cancel at any stage except
 * Cancelled — and nobody may cancel once the order's delivery is Delivered.
 */

const { withTransaction } = require('../../../shared/db/connection');
const ApiError = require('../../../shared/utils/ApiError');
const { ORDER_STATUS, DELIVERY_STATUS } = require('../../../shared/constants/statuses');
const cartRepository = require('../repositories/cart.repository');
const orderRepository = require('../repositories/order.repository');
const inventoryService = require('../../product-catalogue/services/inventory.service');
const whatsappService = require('./whatsapp.service');
const activityLogService = require('../../store-administration/services/activity-log.service');

/**
 * POST /orders — checkout (Customer, mandatory; DEC-02).
 * Converts the customer's current ACTIVE cart into a Pending Order.
 * Validation per Detailed System Architecture V1.2, Section 9's Pending
 * row: "Cart non-empty, customer authenticated, products still available."
 * The availability check here is ADVISORY ONLY (System Architecture
 * Section 9.1) — the sole AUTHORITATIVE stock check happens later, inside
 * Module A, at the exact moment decreaseStock() runs during confirmation.
 *
 * `deliveryAddress` (project-owner amendment resolving the EP-03
 * delivery-address schema gap) is captured here and stored on the Order —
 * the sole authoritative source Module C's Delivery later snapshots from
 * at the Ready-for-Delivery handover. Never re-read live from Customer.
 */
async function checkout(customerId, { deliveryAddress }) {
  const cart = await cartRepository.findActiveCartByCustomerId(customerId);
  const items = cart ? await cartRepository.findItemsByCartId(cart.cart_id) : [];
  if (items.length === 0) {
    throw ApiError.badRequest('CART_EMPTY', 'Your cart is empty — add items before checking out.');
  }

  // Price-snapshot source + advisory availability check, both via Module
  // A's exposed read interface only (never a direct products/inventory_stock read).
  const lines = [];
  for (const item of items) {
    // eslint-disable-next-line no-await-in-loop
    const product = await inventoryService.getProduct(item.product_id);
    // eslint-disable-next-line no-await-in-loop
    const availability = await inventoryService.getAvailability(item.product_id);
    if (availability.availabilityStatus !== 'IN_STOCK') {
      throw ApiError.conflict(
        'PRODUCT_UNAVAILABLE',
        `"${product.name}" is currently out of stock and cannot be ordered.`
      );
    }
    lines.push({ productId: item.product_id, quantity: item.quantity, product });
  }

  const whatsapp = whatsappService.buildCheckoutMessage({
    items: lines.map((l) => ({ productName: l.product.name, quantity: l.quantity })),
  });

  const orderId = await withTransaction(async (conn) => {
    const newOrderId = await orderRepository.createOrder(
      { customerId, deliveryAddress, whatsappCheckoutReference: whatsapp.link },
      conn
    );
    for (const line of lines) {
      // eslint-disable-next-line no-await-in-loop
      await orderRepository.addOrderItem(
        {
          orderId: newOrderId,
          productId: line.productId,
          quantity: line.quantity,
          priceSnapshot: line.product.price,
        },
        conn
      );
    }
    await cartRepository.markConverted(cart.cart_id, conn);
    return newOrderId;
  });

  // activity_log.actor_type only accepts STAFF_ADMIN_USER/OWNER_ADMIN/SYSTEM
  // (activity-log.service.js's VALID_ACTOR_TYPES) — it was never extended to
  // represent a Customer actor. Left null here rather than mis-tagging the
  // actor; the order row itself (affectedEntityId) already carries customer_id.
  await activityLogService.logActivity({
    actorType: null,
    actorId: null,
    actionType: 'ORDER_CREATED',
    affectedEntityType: 'Order',
    affectedEntityId: orderId,
    originatingModule: 'B',
    contextNote: `Placed by Customer #${customerId}.`,
  });

  const detail = await getOrderDetail(orderId);
  return { ...detail, whatsappMessage: whatsapp.text };
}

async function getOrderDetail(orderId) {
  const order = await orderRepository.findById(orderId);
  if (!order) {
    throw ApiError.notFound('ORDER_NOT_FOUND', `Order ${orderId} does not exist.`);
  }
  const items = await orderRepository.findItemsByOrderId(orderId);
  return {
    orderId: order.order_id,
    customerId: order.customer_id,
    status: order.status,
    deliveryAddress: order.delivery_address,
    whatsappCheckoutReference: order.whatsapp_checkout_reference,
    createdAt: order.created_at,
    items: items.map((i) => ({
      orderItemId: i.order_item_id,
      productId: i.product_id,
      quantity: i.quantity,
      priceSnapshot: i.price_snapshot,
    })),
  };
}

async function listCustomerOrders(customerId, { status, page, limit }) {
  const { rows, total } = await orderRepository.findByCustomerId(customerId, { status, page, limit });
  return { data: rows.map(toOrderSummaryDTO), meta: { page, limit, total } };
}

async function listAllOrders({ status, page, limit }) {
  const { rows, total } = await orderRepository.findAll({ status, page, limit });
  return { data: rows.map(toOrderSummaryDTO), meta: { page, limit, total } };
}

function toOrderSummaryDTO(row) {
  return { orderId: row.order_id, customerId: row.customer_id, status: row.status, createdAt: row.created_at };
}

/**
 * PATCH /orders/:id/confirm — Admin. Pending -> Confirmed.
 * Atomic: verify state -> decreaseStock() per item -> update order status
 * -> add status history -> commit. Any failure (including insufficient
 * stock, discovered only inside Module A at this exact moment) rolls the
 * whole transaction back: stock stays unchanged and the order stays
 * Pending — no partial mutation (System Architecture V1.2, Section 9.1;
 * Backend/API Architecture Design V1.0, Section 12).
 */
async function confirmOrder(orderId, actor) {
  const order = await orderRepository.findById(orderId);
  if (!order) {
    throw ApiError.notFound('ORDER_NOT_FOUND', `Order ${orderId} does not exist.`);
  }
  if (order.status !== ORDER_STATUS.PENDING) {
    throw ApiError.unprocessable('INVALID_ORDER_STATE', `Order ${orderId} is not Pending and cannot be confirmed.`);
  }

  await withTransaction(async (conn) => {
    const items = await orderRepository.findItemsByOrderId(orderId, conn);
    for (const item of items) {
      // eslint-disable-next-line no-await-in-loop
      await inventoryService.decreaseStock(item.product_id, item.quantity, conn);
    }
    await orderRepository.updateStatus(orderId, ORDER_STATUS.CONFIRMED, conn);
    await orderRepository.addStatusHistory(
      {
        orderId,
        fromStatus: ORDER_STATUS.PENDING,
        toStatus: ORDER_STATUS.CONFIRMED,
        actorType: actor.actorType,
        actorId: actor.actorId,
      },
      conn
    );
  });

  await activityLogService.logActivity({
    actorType: actor.actorType,
    actorId: actor.actorId,
    actionType: 'ORDER_CONFIRMED',
    affectedEntityType: 'Order',
    affectedEntityId: orderId,
    originatingModule: 'B',
  });

  return getOrderDetail(orderId);
}

// Confirmed->Processing->Ready for Delivery only. Pending->Confirmed is a
// separate endpoint/method (confirmOrder) — a successful decreaseStock()
// completes ONLY that transition, never this one automatically (System
// Architecture V1.2, Section 9.1).
const ALLOWED_TRANSITIONS = {
  [ORDER_STATUS.CONFIRMED]: ORDER_STATUS.PROCESSING,
  [ORDER_STATUS.PROCESSING]: ORDER_STATUS.READY_FOR_DELIVERY,
};

/**
 * PATCH /orders/:id/status — Admin. Confirmed -> Processing -> Ready for
 * Delivery. No stock effect at either transition.
 */
async function advanceStatus(orderId, targetStatus, actor) {
  const order = await orderRepository.findById(orderId);
  if (!order) {
    throw ApiError.notFound('ORDER_NOT_FOUND', `Order ${orderId} does not exist.`);
  }
  const expectedTarget = ALLOWED_TRANSITIONS[order.status];
  if (expectedTarget !== targetStatus) {
    throw ApiError.unprocessable(
      'INVALID_ORDER_TRANSITION',
      `Order ${orderId} cannot move from ${order.status} to ${targetStatus}.`
    );
  }

  await withTransaction(async (conn) => {
    await orderRepository.updateStatus(orderId, targetStatus, conn);
    await orderRepository.addStatusHistory(
      { orderId, fromStatus: order.status, toStatus: targetStatus, actorType: actor.actorType, actorId: actor.actorId },
      conn
    );
  });

  await activityLogService.logActivity({
    actorType: actor.actorType,
    actorId: actor.actorId,
    actionType: `ORDER_STATUS_${targetStatus}`,
    affectedEntityType: 'Order',
    affectedEntityId: orderId,
    originatingModule: 'B',
  });

  // TODO once Module C (EP-03) exists: when targetStatus === READY_FOR_DELIVERY,
  // this is the documented handover point (System Architecture V1.2,
  // Section 9/11) — Module C creates its own Delivery record by reading
  // this order's data. Not implemented here: Module B does not own or
  // create Delivery records.

  return getOrderDetail(orderId);
}

/**
 * PATCH /orders/:id/cancel.
 * Authorization (project-owner decision, resolving the previously-OPEN
 * cancellation-authority question — Section 15 item 5): a Customer may
 * self-cancel only their OWN order, and only while it is still Pending;
 * Admin/Owner may cancel at any (non-Cancelled) stage.
 *
 * Stock EFFECTS were never part of that open question — they were always
 * locked (System Architecture V1.2, Section 9): Pending -> Cancelled has
 * no stock effect (nothing was deducted); Confirmed-or-later -> Cancelled
 * requests an increaseStock() restoration, atomically with the status
 * update, exactly like confirmOrder()'s decreaseStock() pairing.
 *
 * @param {number} orderId
 * @param {{ type: 'CUSTOMER', customerId: number, actorType: 'CUSTOMER', actorId: number }
 *        | { type: 'ADMIN', actorType: string, actorId: number|null }} requester
 */
async function cancelOrder(orderId, requester) {
  const order = await orderRepository.findById(orderId);
  if (!order) {
    throw ApiError.notFound('ORDER_NOT_FOUND', `Order ${orderId} does not exist.`);
  }
  if (order.status === ORDER_STATUS.CANCELLED) {
    throw ApiError.unprocessable('INVALID_ORDER_STATE', `Order ${orderId} is already Cancelled.`);
  }

  if (requester.type === 'CUSTOMER' && order.customer_id !== requester.customerId) {
    throw ApiError.forbidden('FORBIDDEN', "You cannot cancel another customer's order.");
  }

  // A Delivered order is final for Customer and Admin alike: cancelling it
  // would restore stock for goods that have already been handed over. Module C
  // owns delivery status, so ask its exposed service. It is required here,
  // not at the top of the file, because delivery.service.js itself requires
  // this module (a top-level require in both directions would be circular).
  // eslint-disable-next-line global-require
  const { getDeliveryStatusForOrder } = require('../../delivery-review/services/delivery.service');
  if ((await getDeliveryStatusForOrder(orderId)) === DELIVERY_STATUS.DELIVERED) {
    throw ApiError.unprocessable(
      'ORDER_ALREADY_DELIVERED',
      `Order ${orderId} has already been delivered and can no longer be cancelled.`
    );
  }

  if (requester.type === 'CUSTOMER' && order.status !== ORDER_STATUS.PENDING) {
    throw ApiError.forbidden(
      'CUSTOMER_CANCEL_NOT_ALLOWED',
      'You may only cancel your own order while it is still Pending. Contact the store for a later-stage order.'
    );
  }
  // requester.type === 'ADMIN': permitted from any other non-Cancelled stage. A
  // delivery that already exists (not yet Delivered) is left exactly as it is,
  // but delivery.service.js's advanceStatus() refuses to move it any further.

  const stockWasDeducted = order.status !== ORDER_STATUS.PENDING;

  await withTransaction(async (conn) => {
    if (stockWasDeducted) {
      const items = await orderRepository.findItemsByOrderId(orderId, conn);
      for (const item of items) {
        // eslint-disable-next-line no-await-in-loop
        await inventoryService.increaseStock(item.product_id, item.quantity, conn);
      }
    }
    await orderRepository.updateStatus(orderId, ORDER_STATUS.CANCELLED, conn);
    await orderRepository.addStatusHistory(
      {
        orderId,
        fromStatus: order.status,
        toStatus: ORDER_STATUS.CANCELLED,
        actorType: requester.actorType,
        actorId: requester.actorId,
      },
      conn
    );
  });

  // Same activity_log.actor_type constraint as checkout() above: a Customer
  // requester can't be represented in the central log's actor_type ENUM, so
  // only forward requester.actorType/actorId when it's actually an admin.
  const stockNote = stockWasDeducted ? 'Stock restored on cancellation.' : 'No stock effect (order was Pending).';
  await activityLogService.logActivity({
    actorType: requester.type === 'ADMIN' ? requester.actorType : null,
    actorId: requester.type === 'ADMIN' ? requester.actorId : null,
    actionType: 'ORDER_CANCELLED',
    affectedEntityType: 'Order',
    affectedEntityId: orderId,
    originatingModule: 'B',
    contextNote: requester.type === 'CUSTOMER' ? `${stockNote} Cancelled by Customer #${requester.customerId}.` : stockNote,
  });

  return getOrderDetail(orderId);
}

module.exports = {
  checkout,
  getOrderDetail,
  listCustomerOrders,
  listAllOrders,
  confirmOrder,
  advanceStatus,
  cancelOrder,
};
