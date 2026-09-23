import { getProduct } from "../api/products";

/**
 * Order Item carries only { productId, quantity, priceSnapshot } — no
 * product name/image (Physical Schema V1.0: no such join on order_items).
 * Enriches each line with a live GET /products/:id lookup so order pages
 * can show a real product name instead of "Product #5". Product-not-found
 * (e.g. later discontinued... though discontinue is soft-delete, so this
 * mainly guards against a transient error) degrades to a label, not a crash.
 */
export async function enrichOrderItems(order) {
  const cache = new Map();
  const items = await Promise.all(
    order.items.map(async (item) => {
      if (!cache.has(item.productId)) {
        cache.set(
          item.productId,
          getProduct(item.productId).catch(() => null)
        );
      }
      const product = await cache.get(item.productId);
      return { ...item, product };
    })
  );
  return { ...order, items };
}
