/**
 * delivery.courier-view.test.js
 * delivery.service.toCourierDelivery(): the Delivery Person's view of a
 * delivery keeps only what the Delivery Tracking page needs and never leaks
 * internal audit detail (history actor references, from-statuses) or the
 * delivery person reference.
 */

jest.mock('../../../../../src/shared/db/connection', () => ({
  pool: { query: jest.fn() },
  withTransaction: jest.fn(),
}));
jest.mock('../../../../../src/modules/delivery-review/repositories/delivery.repository', () => ({
  create: jest.fn(),
  findById: jest.fn(),
  findByOrderId: jest.fn(),
  updateStatus: jest.fn(),
  addStatusHistory: jest.fn(),
  findStatusHistory: jest.fn(),
}));
jest.mock('../../../../../src/modules/customer-order/services/order.service', () => ({
  getOrderDetail: jest.fn(),
}));
jest.mock('../../../../../src/modules/store-administration/services/activity-log.service', () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

const deliveryRepository = require('../../../../../src/modules/delivery-review/repositories/delivery.repository');
const deliveryService = require('../../../../../src/modules/delivery-review/services/delivery.service');

const ASSIGNED_AT = new Date('2026-09-15T10:00:00Z');
const CHANGED_AT = new Date('2026-09-15T10:30:00Z');

beforeEach(() => jest.clearAllMocks());

describe('delivery.service.toCourierDelivery()', () => {
  it('returns exactly the fields the courier page needs', async () => {
    deliveryRepository.findById.mockResolvedValue({
      delivery_id: 3,
      order_id: 42,
      delivery_address: '12 Temple Road, Colombo',
      delivery_person_reference: 'Kasun 0771234567',
      status: 'HEADING_TO_STORE',
      assigned_at: ASSIGNED_AT,
    });
    deliveryRepository.findStatusHistory.mockResolvedValue([
      { from_status: 'ASSIGNED', to_status: 'HEADING_TO_STORE', actor_reference: 'Kasun 0771234567', changed_at: CHANGED_AT },
    ]);

    const view = deliveryService.toCourierDelivery(await deliveryService.getDeliveryById(3));

    expect(view).toEqual({
      deliveryId: 3,
      orderId: 42,
      deliveryAddress: '12 Temple Road, Colombo',
      status: 'HEADING_TO_STORE',
      nextStatus: 'PICKED_UP',
      assignedAt: ASSIGNED_AT,
      history: [{ toStatus: 'HEADING_TO_STORE', changedAt: CHANGED_AT }],
    });
  });

  it('never includes actor references, from-statuses or the delivery person reference', async () => {
    deliveryRepository.findById.mockResolvedValue({
      delivery_id: 3,
      order_id: 42,
      delivery_address: 'Addr',
      delivery_person_reference: 'SECRET-COURIER-REF',
      status: 'PICKED_UP',
      assigned_at: ASSIGNED_AT,
    });
    deliveryRepository.findStatusHistory.mockResolvedValue([
      { from_status: 'ASSIGNED', to_status: 'HEADING_TO_STORE', actor_reference: 'SECRET-ACTOR-1', changed_at: CHANGED_AT },
      { from_status: 'HEADING_TO_STORE', to_status: 'PICKED_UP', actor_reference: 'SECRET-ACTOR-2', changed_at: CHANGED_AT },
    ]);

    const json = JSON.stringify(deliveryService.toCourierDelivery(await deliveryService.getDeliveryById(3)));
    expect(json).not.toMatch(/SECRET-|actorReference|fromStatus|deliveryPersonReference/);
  });

  it.each([
    ['ASSIGNED', 'HEADING_TO_STORE'],
    ['HEADING_TO_STORE', 'PICKED_UP'],
    ['PICKED_UP', 'OUT_FOR_DELIVERY'],
    ['OUT_FOR_DELIVERY', 'ARRIVED'],
    ['ARRIVED', 'DELIVERED'],
    ['DELIVERED', null],
  ])('reports nextStatus for %s as %s', (status, next) => {
    const view = deliveryService.toCourierDelivery({ deliveryId: 1, orderId: 1, deliveryAddress: 'A', status, assignedAt: ASSIGNED_AT, history: [] });
    expect(view.nextStatus).toBe(next);
  });
});
