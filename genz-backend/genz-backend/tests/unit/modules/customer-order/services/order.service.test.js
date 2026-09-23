/**
 * order.service.test.js
 * The most important test file in this module: verifies EP-01 ownership is
 * respected (stock is mutated ONLY via inventory.service.js's
 * decreaseStock, never a direct write), the Pending->Confirmed atomicity
 * contract, the advisory-vs-authoritative availability distinction
 * (System Architecture V1.2 Section 9.1), and the Confirmed->Processing->
 * Ready-for-Delivery transition rules.
 */

jest.mock('../../../../../src/shared/db/connection', () => ({
  pool: { query: jest.fn() },
  withTransaction: jest.fn(),
}));
jest.mock('../../../../../src/modules/customer-order/repositories/cart.repository', () => ({
  findActiveCartByCustomerId: jest.fn(),
  findItemsByCartId: jest.fn(),
  markConverted: jest.fn(),
}));
jest.mock('../../../../../src/modules/customer-order/repositories/order.repository', () => ({
  createOrder: jest.fn(),
  addOrderItem: jest.fn(),
  findById: jest.fn(),
  findItemsByOrderId: jest.fn(),
  findByCustomerId: jest.fn(),
  findAll: jest.fn(),
  updateStatus: jest.fn(),
  addStatusHistory: jest.fn(),
}));
jest.mock('../../../../../src/modules/product-catalogue/services/inventory.service', () => ({
  getProduct: jest.fn(),
  getAvailability: jest.fn(),
  decreaseStock: jest.fn(),
  increaseStock: jest.fn(),
}));
jest.mock('../../../../../src/modules/customer-order/services/whatsapp.service', () => ({
  buildCheckoutMessage: jest.fn(() => ({ text: 'msg', link: 'https://wa.me/123?text=msg' })),
}));
jest.mock('../../../../../src/modules/store-administration/services/activity-log.service', () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
// cancelOrder() asks Module C whether the order's delivery is already Delivered.
jest.mock('../../../../../src/modules/delivery-review/services/delivery.service', () => ({
  getDeliveryStatusForOrder: jest.fn(),
}));

const { withTransaction } = require('../../../../../src/shared/db/connection');
const cartRepository = require('../../../../../src/modules/customer-order/repositories/cart.repository');
const orderRepository = require('../../../../../src/modules/customer-order/repositories/order.repository');
const inventoryService = require('../../../../../src/modules/product-catalogue/services/inventory.service');
const activityLogService = require('../../../../../src/modules/store-administration/services/activity-log.service');
const orderService = require('../../../../../src/modules/customer-order/services/order.service');
const deliveryService = require('../../../../../src/modules/delivery-review/services/delivery.service');

const fakeConn = { query: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  withTransaction.mockImplementation((work) => work(fakeConn));
  deliveryService.getDeliveryStatusForOrder.mockResolvedValue(null); // no delivery unless a test says so
});

describe('order.service.checkout()', () => {
  const checkoutInput = { deliveryAddress: '123 Main St, Colombo' };

  it('rejects (400 CART_EMPTY) when the cart has no active items, without starting a transaction', async () => {
    cartRepository.findActiveCartByCustomerId.mockResolvedValue(null);

    await expect(orderService.checkout(10, checkoutInput)).rejects.toMatchObject({
      statusCode: 400,
      code: 'CART_EMPTY',
    });
    expect(withTransaction).not.toHaveBeenCalled();
  });

  it('checks availability and reads price via inventory.service.js ONLY — never a direct products/inventory_stock read', async () => {
    cartRepository.findActiveCartByCustomerId.mockResolvedValue({ cart_id: 1, customer_id: 10, status: 'ACTIVE' });
    cartRepository.findItemsByCartId.mockResolvedValue([{ cart_item_id: 1, product_id: 5, quantity: 2 }]);
    inventoryService.getProduct.mockResolvedValue({ product_id: 5, name: 'Shirt', price: '19.99' });
    inventoryService.getAvailability.mockResolvedValue({ productId: 5, availabilityStatus: 'IN_STOCK' });
    orderRepository.createOrder.mockResolvedValue(100);
    orderRepository.findById.mockResolvedValue({
      order_id: 100,
      customer_id: 10,
      status: 'PENDING',
      delivery_address: '123 Main St, Colombo',
      whatsapp_checkout_reference: null,
      created_at: '2026-01-01',
    });
    orderRepository.findItemsByOrderId.mockResolvedValue([]);

    await orderService.checkout(10, checkoutInput);

    expect(inventoryService.getProduct).toHaveBeenCalledWith(5);
    expect(inventoryService.getAvailability).toHaveBeenCalledWith(5);
  });

  it('rejects (409 PRODUCT_UNAVAILABLE) when a cart item is out of stock — advisory check, before any transaction/order is created', async () => {
    cartRepository.findActiveCartByCustomerId.mockResolvedValue({ cart_id: 1, customer_id: 10, status: 'ACTIVE' });
    cartRepository.findItemsByCartId.mockResolvedValue([{ cart_item_id: 1, product_id: 5, quantity: 2 }]);
    inventoryService.getProduct.mockResolvedValue({ product_id: 5, name: 'Shirt', price: '19.99' });
    inventoryService.getAvailability.mockResolvedValue({ productId: 5, availabilityStatus: 'OUT_OF_STOCK' });

    await expect(orderService.checkout(10, checkoutInput)).rejects.toMatchObject({
      statusCode: 409,
      code: 'PRODUCT_UNAVAILABLE',
    });
    expect(withTransaction).not.toHaveBeenCalled();
    expect(orderRepository.createOrder).not.toHaveBeenCalled();
  });

  it('on success: creates the Order (with the delivery address snapshot) + Order Items with a price snapshot, marks the cart Converted, and logs to the Activity Log — all with no direct inventory mutation', async () => {
    cartRepository.findActiveCartByCustomerId.mockResolvedValue({ cart_id: 1, customer_id: 10, status: 'ACTIVE' });
    cartRepository.findItemsByCartId.mockResolvedValue([{ cart_item_id: 1, product_id: 5, quantity: 2 }]);
    inventoryService.getProduct.mockResolvedValue({ product_id: 5, name: 'Shirt', price: '19.99' });
    inventoryService.getAvailability.mockResolvedValue({ productId: 5, availabilityStatus: 'IN_STOCK' });
    orderRepository.createOrder.mockResolvedValue(100);
    orderRepository.findById.mockResolvedValue({
      order_id: 100,
      customer_id: 10,
      status: 'PENDING',
      delivery_address: '123 Main St, Colombo',
      whatsapp_checkout_reference: 'https://wa.me/123?text=msg',
      created_at: '2026-01-01',
    });
    orderRepository.findItemsByOrderId.mockResolvedValue([
      { order_item_id: 1, product_id: 5, quantity: 2, price_snapshot: '19.99' },
    ]);

    const result = await orderService.checkout(10, checkoutInput);

    expect(orderRepository.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 10, deliveryAddress: '123 Main St, Colombo' }),
      fakeConn
    );
    expect(orderRepository.addOrderItem).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 100, productId: 5, quantity: 2, priceSnapshot: '19.99' }),
      fakeConn
    );
    expect(cartRepository.markConverted).toHaveBeenCalledWith(1, fakeConn);
    expect(inventoryService.decreaseStock).not.toHaveBeenCalled();
    expect(inventoryService.increaseStock).not.toHaveBeenCalled();
    expect(activityLogService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'ORDER_CREATED', originatingModule: 'B', affectedEntityId: 100 })
    );
    expect(result.deliveryAddress).toBe('123 Main St, Colombo');
    expect(result.orderId).toBe(100);
    expect(result.status).toBe('PENDING');
    expect(result.whatsappMessage).toBe('msg');
  });
});

describe('order.service.confirmOrder() — the core EP-01 boundary + atomicity test', () => {
  const actor = { actorType: 'OWNER_ADMIN', actorId: null };

  it('404s when the order does not exist', async () => {
    orderRepository.findById.mockResolvedValue(null);
    await expect(orderService.confirmOrder(999, actor)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('422s INVALID_ORDER_STATE when the order is not Pending', async () => {
    orderRepository.findById.mockResolvedValue({ order_id: 1, status: 'CONFIRMED' });
    await expect(orderService.confirmOrder(1, actor)).rejects.toMatchObject({
      statusCode: 422,
      code: 'INVALID_ORDER_STATE',
    });
  });

  it('calls inventory.service.js.decreaseStock() — and ONLY that — for each order item, on the SAME transaction connection', async () => {
    orderRepository.findById.mockResolvedValueOnce({ order_id: 1, status: 'PENDING' }).mockResolvedValue({
      order_id: 1,
      status: 'CONFIRMED',
      customer_id: 10,
      created_at: 'x',
    });
    orderRepository.findItemsByOrderId.mockResolvedValue([
      { order_item_id: 1, product_id: 5, quantity: 2, price_snapshot: '19.99' },
      { order_item_id: 2, product_id: 6, quantity: 1, price_snapshot: '9.99' },
    ]);

    await orderService.confirmOrder(1, actor);

    expect(inventoryService.decreaseStock).toHaveBeenCalledTimes(2);
    expect(inventoryService.decreaseStock).toHaveBeenNthCalledWith(1, 5, 2, fakeConn);
    expect(inventoryService.decreaseStock).toHaveBeenNthCalledWith(2, 6, 1, fakeConn);
    expect(inventoryService.increaseStock).not.toHaveBeenCalled();
    expect(orderRepository.updateStatus).toHaveBeenCalledWith(1, 'CONFIRMED', fakeConn);
    expect(orderRepository.addStatusHistory).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 1, fromStatus: 'PENDING', toStatus: 'CONFIRMED' }),
      fakeConn
    );
    expect(activityLogService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'ORDER_CONFIRMED', originatingModule: 'B' })
    );
  });

  it('atomicity: if decreaseStock() rejects (insufficient stock), the order status is never updated and no history entry is written', async () => {
    orderRepository.findById.mockResolvedValue({ order_id: 1, status: 'PENDING' });
    orderRepository.findItemsByOrderId.mockResolvedValue([
      { order_item_id: 1, product_id: 5, quantity: 999, price_snapshot: '19.99' },
    ]);
    const insufficientStock = Object.assign(new Error('insufficient stock'), {
      statusCode: 409,
      code: 'INSUFFICIENT_STOCK',
    });
    inventoryService.decreaseStock.mockRejectedValue(insufficientStock);

    await expect(orderService.confirmOrder(1, actor)).rejects.toBe(insufficientStock);

    expect(orderRepository.updateStatus).not.toHaveBeenCalled();
    expect(orderRepository.addStatusHistory).not.toHaveBeenCalled();
    expect(activityLogService.logActivity).not.toHaveBeenCalled();
  });
});

describe('order.service.advanceStatus() — Confirmed -> Processing -> Ready for Delivery', () => {
  const actor = { actorType: 'OWNER_ADMIN', actorId: null };

  it('allows Confirmed -> Processing', async () => {
    orderRepository.findById
      .mockResolvedValueOnce({ order_id: 1, status: 'CONFIRMED' })
      .mockResolvedValue({ order_id: 1, status: 'PROCESSING', customer_id: 10, created_at: 'x' });
    orderRepository.findItemsByOrderId.mockResolvedValue([]);

    await orderService.advanceStatus(1, 'PROCESSING', actor);

    expect(orderRepository.updateStatus).toHaveBeenCalledWith(1, 'PROCESSING', fakeConn);
    expect(inventoryService.decreaseStock).not.toHaveBeenCalled();
    expect(inventoryService.increaseStock).not.toHaveBeenCalled();
  });

  it('allows Processing -> Ready for Delivery', async () => {
    orderRepository.findById
      .mockResolvedValueOnce({ order_id: 1, status: 'PROCESSING' })
      .mockResolvedValue({ order_id: 1, status: 'READY_FOR_DELIVERY', customer_id: 10, created_at: 'x' });
    orderRepository.findItemsByOrderId.mockResolvedValue([]);

    await orderService.advanceStatus(1, 'READY_FOR_DELIVERY', actor);
    expect(orderRepository.updateStatus).toHaveBeenCalledWith(1, 'READY_FOR_DELIVERY', fakeConn);
  });

  it('rejects (422) an out-of-sequence transition, e.g. Pending -> Ready for Delivery directly', async () => {
    orderRepository.findById.mockResolvedValue({ order_id: 1, status: 'PENDING' });
    await expect(orderService.advanceStatus(1, 'READY_FOR_DELIVERY', actor)).rejects.toMatchObject({
      statusCode: 422,
      code: 'INVALID_ORDER_TRANSITION',
    });
    expect(orderRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('rejects (422) trying to go backwards, e.g. Processing -> Confirmed', async () => {
    orderRepository.findById.mockResolvedValue({ order_id: 1, status: 'PROCESSING' });
    await expect(orderService.advanceStatus(1, 'CONFIRMED', actor)).rejects.toMatchObject({
      statusCode: 422,
      code: 'INVALID_ORDER_TRANSITION',
    });
  });
});

describe('order.service.cancelOrder() — project-owner decision: Customer self-service (Pending only) / Admin (any stage)', () => {
  const admin = { type: 'ADMIN', actorType: 'OWNER_ADMIN', actorId: null };
  const owningCustomer = { type: 'CUSTOMER', customerId: 10, actorType: 'CUSTOMER', actorId: 10 };
  const otherCustomer = { type: 'CUSTOMER', customerId: 999, actorType: 'CUSTOMER', actorId: 999 };

  it('404s when the order does not exist', async () => {
    orderRepository.findById.mockResolvedValue(null);
    await expect(orderService.cancelOrder(1, admin)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('422s when the order is already Cancelled, for either actor type', async () => {
    orderRepository.findById.mockResolvedValue({ order_id: 1, status: 'CANCELLED', customer_id: 10 });
    await expect(orderService.cancelOrder(1, admin)).rejects.toMatchObject({ statusCode: 422 });
    await expect(orderService.cancelOrder(1, owningCustomer)).rejects.toMatchObject({ statusCode: 422 });
  });

  it("403s a Customer cancelling another customer's order", async () => {
    orderRepository.findById.mockResolvedValue({ order_id: 1, status: 'PENDING', customer_id: 10 });
    await expect(orderService.cancelOrder(1, otherCustomer)).rejects.toMatchObject({ statusCode: 403 });
    expect(orderRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('403s a Customer trying to cancel their OWN order once it is past Pending', async () => {
    orderRepository.findById.mockResolvedValue({ order_id: 1, status: 'CONFIRMED', customer_id: 10 });
    await expect(orderService.cancelOrder(1, owningCustomer)).rejects.toMatchObject({
      statusCode: 403,
      code: 'CUSTOMER_CANCEL_NOT_ALLOWED',
    });
    expect(orderRepository.updateStatus).not.toHaveBeenCalled();
    expect(inventoryService.increaseStock).not.toHaveBeenCalled();
  });

  it('allows a Customer to cancel their own Pending order — no stock effect (nothing was deducted)', async () => {
    orderRepository.findById
      .mockResolvedValueOnce({ order_id: 1, status: 'PENDING', customer_id: 10 })
      .mockResolvedValue({ order_id: 1, status: 'CANCELLED', customer_id: 10, created_at: 'x' });
    orderRepository.findItemsByOrderId.mockResolvedValue([]);

    await orderService.cancelOrder(1, owningCustomer);

    expect(inventoryService.increaseStock).not.toHaveBeenCalled();
    expect(orderRepository.updateStatus).toHaveBeenCalledWith(1, 'CANCELLED', fakeConn);
    expect(orderRepository.addStatusHistory).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 1, fromStatus: 'PENDING', toStatus: 'CANCELLED', actorType: 'CUSTOMER', actorId: 10 }),
      fakeConn
    );
  });

  it('allows Admin to cancel a Confirmed order — restores stock via increaseStock() ONLY, atomically with the status update', async () => {
    orderRepository.findById
      .mockResolvedValueOnce({ order_id: 1, status: 'CONFIRMED', customer_id: 10 })
      .mockResolvedValue({ order_id: 1, status: 'CANCELLED', customer_id: 10, created_at: 'x' });
    orderRepository.findItemsByOrderId.mockResolvedValue([
      { order_item_id: 1, product_id: 5, quantity: 2, price_snapshot: '19.99' },
    ]);

    await orderService.cancelOrder(1, admin);

    expect(inventoryService.increaseStock).toHaveBeenCalledWith(5, 2, fakeConn);
    expect(inventoryService.decreaseStock).not.toHaveBeenCalled();
    expect(orderRepository.updateStatus).toHaveBeenCalledWith(1, 'CANCELLED', fakeConn);
  });

  it('allows Admin to cancel a Pending order too, with no stock effect', async () => {
    orderRepository.findById
      .mockResolvedValueOnce({ order_id: 1, status: 'PENDING', customer_id: 10 })
      .mockResolvedValue({ order_id: 1, status: 'CANCELLED', customer_id: 10, created_at: 'x' });
    orderRepository.findItemsByOrderId.mockResolvedValue([]);

    await orderService.cancelOrder(1, admin);

    expect(inventoryService.increaseStock).not.toHaveBeenCalled();
    expect(orderRepository.updateStatus).toHaveBeenCalledWith(1, 'CANCELLED', fakeConn);
  });
});

describe('order.service.cancelOrder() — a Delivered order can no longer be cancelled', () => {
  const admin = { type: 'ADMIN', actorType: 'OWNER_ADMIN', actorId: null };
  const owningCustomer = { type: 'CUSTOMER', customerId: 10, actorType: 'CUSTOMER', actorId: 10 };
  const otherCustomer = { type: 'CUSTOMER', customerId: 999, actorType: 'CUSTOMER', actorId: 999 };
  const readyOrder = { order_id: 1, status: 'READY_FOR_DELIVERY', customer_id: 10 };
  const items = [{ order_item_id: 1, product_id: 5, quantity: 2, price_snapshot: '19.99' }];

  function expectNothingChanged() {
    expect(withTransaction).not.toHaveBeenCalled();
    expect(orderRepository.findItemsByOrderId).not.toHaveBeenCalled();
    expect(inventoryService.increaseStock).not.toHaveBeenCalled();
    expect(orderRepository.updateStatus).not.toHaveBeenCalled();
    expect(orderRepository.addStatusHistory).not.toHaveBeenCalled();
    expect(activityLogService.logActivity).not.toHaveBeenCalled();
  }

  it("asks the delivery module (its exposed service) for the order's delivery status", async () => {
    orderRepository.findById.mockResolvedValue(readyOrder);
    deliveryService.getDeliveryStatusForOrder.mockResolvedValue('DELIVERED');

    await expect(orderService.cancelOrder(1, admin)).rejects.toMatchObject({ statusCode: 422 });
    expect(deliveryService.getDeliveryStatusForOrder).toHaveBeenCalledWith(1);
  });

  it('14/15. 422s ORDER_ALREADY_DELIVERED for Admin and restores NO stock', async () => {
    orderRepository.findById.mockResolvedValue(readyOrder);
    orderRepository.findItemsByOrderId.mockResolvedValue(items);
    deliveryService.getDeliveryStatusForOrder.mockResolvedValue('DELIVERED');

    await expect(orderService.cancelOrder(1, admin)).rejects.toMatchObject({
      statusCode: 422,
      code: 'ORDER_ALREADY_DELIVERED',
      message: 'Order 1 has already been delivered and can no longer be cancelled.',
    });
    expectNothingChanged();
  });

  it('13. 422s ORDER_ALREADY_DELIVERED for the owning Customer too, with no stock effect', async () => {
    orderRepository.findById.mockResolvedValue(readyOrder);
    deliveryService.getDeliveryStatusForOrder.mockResolvedValue('DELIVERED');

    await expect(orderService.cancelOrder(1, owningCustomer)).rejects.toMatchObject({
      statusCode: 422,
      code: 'ORDER_ALREADY_DELIVERED',
    });
    expectNothingChanged();
  });

  it("still 403s a Customer cancelling another customer's Delivered order (ownership is checked first)", async () => {
    orderRepository.findById.mockResolvedValue(readyOrder);
    deliveryService.getDeliveryStatusForOrder.mockResolvedValue('DELIVERED');

    await expect(orderService.cancelOrder(1, otherCustomer)).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(deliveryService.getDeliveryStatusForOrder).not.toHaveBeenCalled();
    expectNothingChanged();
  });

  it('11. Admin may still cancel a Ready-for-Delivery order whose delivery is still in progress — stock is restored and the delivery is not touched here', async () => {
    orderRepository.findById
      .mockResolvedValueOnce(readyOrder)
      .mockResolvedValue({ ...readyOrder, status: 'CANCELLED', created_at: 'x' });
    orderRepository.findItemsByOrderId.mockResolvedValue(items);
    deliveryService.getDeliveryStatusForOrder.mockResolvedValue('OUT_FOR_DELIVERY');

    await orderService.cancelOrder(1, admin);

    expect(inventoryService.increaseStock).toHaveBeenCalledWith(5, 2, fakeConn);
    expect(orderRepository.updateStatus).toHaveBeenCalledWith(1, 'CANCELLED', fakeConn);
    // The only delivery interaction is the read — no delivery write happens in Module B.
    expect(Object.keys(deliveryService)).toEqual(['getDeliveryStatusForOrder']);
  });

  it('Admin may still cancel a Ready-for-Delivery order before any delivery exists, with stock restored', async () => {
    orderRepository.findById
      .mockResolvedValueOnce(readyOrder)
      .mockResolvedValue({ ...readyOrder, status: 'CANCELLED', created_at: 'x' });
    orderRepository.findItemsByOrderId.mockResolvedValue(items);

    await orderService.cancelOrder(1, admin);

    expect(inventoryService.increaseStock).toHaveBeenCalledWith(5, 2, fakeConn);
    expect(orderRepository.updateStatus).toHaveBeenCalledWith(1, 'CANCELLED', fakeConn);
  });
});
