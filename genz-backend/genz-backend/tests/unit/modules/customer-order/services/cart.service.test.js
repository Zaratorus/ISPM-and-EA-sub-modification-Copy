/**
 * cart.service.test.js
 * Verifies: get-or-create-active-cart semantics, that Product existence is
 * checked ONLY via Module A's exposed inventory.service.js.getProduct()
 * (never a direct products-table read from Module B), the accumulate-on-
 * duplicate-product rule, and ownership/active-state checks on item
 * mutation (module-boundary + business-rule coverage).
 */

jest.mock('../../../../../src/modules/customer-order/repositories/cart.repository', () => ({
  findActiveCartByCustomerId: jest.fn(),
  findCartById: jest.fn(),
  createCart: jest.fn(),
  findItemsByCartId: jest.fn(),
  findItemById: jest.fn(),
  addOrIncrementItem: jest.fn(),
  updateItemQuantity: jest.fn(),
  deleteItem: jest.fn(),
  markConverted: jest.fn(),
}));
jest.mock('../../../../../src/modules/product-catalogue/services/inventory.service', () => ({
  getProduct: jest.fn(),
}));

const cartRepository = require('../../../../../src/modules/customer-order/repositories/cart.repository');
const inventoryService = require('../../../../../src/modules/product-catalogue/services/inventory.service');
const cartService = require('../../../../../src/modules/customer-order/services/cart.service');

describe('cart.service.getOrCreateActiveCart()', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the existing active cart without creating a new one', async () => {
    cartRepository.findActiveCartByCustomerId.mockResolvedValue({ cart_id: 1, customer_id: 10, status: 'ACTIVE' });

    const cart = await cartService.getOrCreateActiveCart(10);

    expect(cart.cart_id).toBe(1);
    expect(cartRepository.createCart).not.toHaveBeenCalled();
  });

  it('creates a new cart when none is active', async () => {
    cartRepository.findActiveCartByCustomerId.mockResolvedValue(null);
    cartRepository.createCart.mockResolvedValue({ cart_id: 2, customer_id: 10, status: 'ACTIVE' });

    const cart = await cartService.getOrCreateActiveCart(10);

    expect(cartRepository.createCart).toHaveBeenCalledWith(10);
    expect(cart.cart_id).toBe(2);
  });
});

describe('cart.service.addItem()', () => {
  beforeEach(() => jest.clearAllMocks());

  it('verifies the product exists via inventory.service.js.getProduct() — never a direct products read', async () => {
    inventoryService.getProduct.mockResolvedValue({ product_id: 5, name: 'Shirt', price: '19.99' });
    cartRepository.findActiveCartByCustomerId.mockResolvedValue({ cart_id: 1, customer_id: 10, status: 'ACTIVE' });
    cartRepository.findItemsByCartId.mockResolvedValue([]);

    await cartService.addItem(10, { productId: 5, quantity: 2 });

    expect(inventoryService.getProduct).toHaveBeenCalledWith(5);
    expect(cartRepository.addOrIncrementItem).toHaveBeenCalledWith(1, 5, 2);
  });

  it('propagates a 404 from getProduct() without ever calling addOrIncrementItem (no orphan cart_items row)', async () => {
    const notFound = Object.assign(new Error('not found'), { statusCode: 404 });
    inventoryService.getProduct.mockRejectedValue(notFound);

    await expect(cartService.addItem(10, { productId: 999, quantity: 1 })).rejects.toBe(notFound);
    expect(cartRepository.addOrIncrementItem).not.toHaveBeenCalled();
  });
});

describe('cart.service.updateItemQuantity() / removeItem() — ownership and active-state checks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects (403) when the cart item belongs to a different customer', async () => {
    cartRepository.findItemById.mockResolvedValue({ cart_item_id: 1, cart_id: 1, product_id: 5, quantity: 2 });
    cartRepository.findCartById.mockResolvedValue({ cart_id: 1, customer_id: 999, status: 'ACTIVE' });

    await expect(cartService.updateItemQuantity(10, 1, 3)).rejects.toMatchObject({ statusCode: 403 });
    expect(cartRepository.updateItemQuantity).not.toHaveBeenCalled();
  });

  it('rejects (409 CART_NOT_ACTIVE) when the owning cart has already been converted (checked out)', async () => {
    cartRepository.findItemById.mockResolvedValue({ cart_item_id: 1, cart_id: 1, product_id: 5, quantity: 2 });
    cartRepository.findCartById.mockResolvedValue({ cart_id: 1, customer_id: 10, status: 'CONVERTED' });

    await expect(cartService.removeItem(10, 1)).rejects.toMatchObject({ statusCode: 409, code: 'CART_NOT_ACTIVE' });
    expect(cartRepository.deleteItem).not.toHaveBeenCalled();
  });

  it('404s when the cart item does not exist at all', async () => {
    cartRepository.findItemById.mockResolvedValue(null);
    await expect(cartService.updateItemQuantity(10, 999, 3)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('succeeds for the owning, active-cart case', async () => {
    cartRepository.findItemById.mockResolvedValue({ cart_item_id: 1, cart_id: 1, product_id: 5, quantity: 2 });
    cartRepository.findCartById.mockResolvedValue({ cart_id: 1, customer_id: 10, status: 'ACTIVE' });
    cartRepository.findActiveCartByCustomerId.mockResolvedValue({ cart_id: 1, customer_id: 10, status: 'ACTIVE' });
    cartRepository.findItemsByCartId.mockResolvedValue([{ cart_item_id: 1, product_id: 5, quantity: 3 }]);

    await cartService.updateItemQuantity(10, 1, 3);
    expect(cartRepository.updateItemQuantity).toHaveBeenCalledWith(1, 3);
  });
});
