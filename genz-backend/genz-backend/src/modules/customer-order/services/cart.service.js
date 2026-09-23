/**
 * cart.service.js
 * Owning module: B (EP-02). Cart is customer-authenticated-only (project-
 * owner decision on the guest-cart-persistence OPEN item — Backend/API
 * Architecture Design V1.0, Section 15 item 2: "Cart only created
 * post-login"). Every function here requires a real, authenticated
 * customerId.
 *
 * Product existence is verified via Module A's exposed read interface
 * (inventory.service.js.getProduct) — never by querying `products`
 * directly (Backend/API Architecture Design V1.0, Section 2 Principle 3 /
 * Section 13: cross-module reads go through the owning module's exposed
 * functions, not another module's repository).
 */

const ApiError = require('../../../shared/utils/ApiError');
const cartRepository = require('../repositories/cart.repository');
const inventoryService = require('../../product-catalogue/services/inventory.service');

async function getOrCreateActiveCart(customerId) {
  const existing = await cartRepository.findActiveCartByCustomerId(customerId);
  if (existing) return existing;
  return cartRepository.createCart(customerId);
}

async function getCart(customerId) {
  const cart = await getOrCreateActiveCart(customerId);
  const items = await cartRepository.findItemsByCartId(cart.cart_id);
  return { cartId: cart.cart_id, items: items.map(toItemDTO) };
}

async function addItem(customerId, { productId, quantity }) {
  await inventoryService.getProduct(productId); // 404s if the product doesn't exist
  const cart = await getOrCreateActiveCart(customerId);
  await cartRepository.addOrIncrementItem(cart.cart_id, productId, quantity);
  return getCart(customerId);
}

async function updateItemQuantity(customerId, cartItemId, quantity) {
  const item = await requireOwnedActiveItem(customerId, cartItemId);
  await cartRepository.updateItemQuantity(item.cart_item_id, quantity);
  return getCart(customerId);
}

async function removeItem(customerId, cartItemId) {
  const item = await requireOwnedActiveItem(customerId, cartItemId);
  await cartRepository.deleteItem(item.cart_item_id);
  return getCart(customerId);
}

async function requireOwnedActiveItem(customerId, cartItemId) {
  const item = await cartRepository.findItemById(cartItemId);
  if (!item) {
    throw ApiError.notFound('CART_ITEM_NOT_FOUND', `Cart item ${cartItemId} does not exist.`);
  }
  const cart = await cartRepository.findCartById(item.cart_id);
  if (!cart || cart.customer_id !== customerId) {
    throw ApiError.forbidden('FORBIDDEN', 'This cart item does not belong to your cart.');
  }
  if (cart.status !== 'ACTIVE') {
    throw ApiError.conflict(
      'CART_NOT_ACTIVE',
      'This cart has already been checked out and can no longer be modified.'
    );
  }
  return item;
}

function toItemDTO(row) {
  return { cartItemId: row.cart_item_id, productId: row.product_id, quantity: row.quantity };
}

module.exports = { getOrCreateActiveCart, getCart, addItem, updateItemQuantity, removeItem };
