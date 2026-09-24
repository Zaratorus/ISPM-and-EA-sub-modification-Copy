import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as cartApi from "../api/cart";
import { getProduct } from "../api/products";
import { toApiError } from "../api/client";
import { useCustomerAuth } from "./CustomerAuthContext";
import { useToast } from "./ToastContext";

const CartContext = createContext(null);

/**
 * Cart is customer-authenticated-only on the backend (no guest cart —
 * Backend/API Architecture Design V1.0, Section 15 item 2, resolved).
 * cart_items carries only { cartItemId, productId, variantLabel, quantity }
 * — no price or product name (Physical Schema V1.0: no price_snapshot on
 * Cart Item, unlike Order Item). This context enriches each line with the
 * product's current price/name/image/availability via GET /products/:id so
 * the UI can show a live subtotal, then re-derives it on every mutation.
 */
export function CartProvider({ children }) {
  const { isAuthenticated } = useCustomerAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState([]);
  const [cartId, setCartId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const enrich = useCallback(async (rawItems) => {
    const productCache = new Map();
    const enriched = await Promise.all(
      rawItems.map(async (item) => {
        let product = productCache.get(item.productId);
        if (!product) {
          try {
            product = await getProduct(item.productId);
            productCache.set(item.productId, product);
          } catch {
            product = null;
          }
        }
        return { ...item, product };
      })
    );
    return enriched;
  }, []);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setItems([]);
      setCartId(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const cart = await cartApi.getCart();
      setCartId(cart.cartId);
      setItems(await enrich(cart.items));
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, enrich]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addItem = useCallback(
    async (productId, quantity = 1, variantLabel) => {
      try {
        const cart = await cartApi.addCartItem({ productId, quantity, variantLabel });
        setCartId(cart.cartId);
        setItems(await enrich(cart.items));
        showToast("Added to cart.", "success");
        return { ok: true };
      } catch (err) {
        const apiError = toApiError(err);
        showToast(apiError.message, "error");
        return { ok: false, error: apiError };
      }
    },
    [enrich, showToast]
  );

  const updateQuantity = useCallback(
    async (cartItemId, quantity) => {
      try {
        const cart = await cartApi.updateCartItem(cartItemId, quantity);
        setCartId(cart.cartId);
        setItems(await enrich(cart.items));
        return { ok: true };
      } catch (err) {
        const apiError = toApiError(err);
        showToast(apiError.message, "error");
        return { ok: false, error: apiError };
      }
    },
    [enrich, showToast]
  );

  const removeItem = useCallback(
    async (cartItemId) => {
      try {
        const cart = await cartApi.removeCartItem(cartItemId);
        setCartId(cart.cartId);
        setItems(await enrich(cart.items));
        showToast("Removed from cart.", "info");
        return { ok: true };
      } catch (err) {
        const apiError = toApiError(err);
        showToast(apiError.message, "error");
        return { ok: false, error: apiError };
      }
    },
    [enrich, showToast]
  );

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + (Number(i.product?.price) || 0) * i.quantity, 0);

  const value = useMemo(
    () => ({ cartId, items, itemCount, subtotal, loading, error, refresh, addItem, updateQuantity, removeItem }),
    [cartId, items, itemCount, subtotal, loading, error, refresh, addItem, updateQuantity, removeItem]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart() must be used within a CartProvider");
  return ctx;
}
