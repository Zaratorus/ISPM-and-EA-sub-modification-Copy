import { useEffect, useState } from "react";
import { searchProducts } from "../api/products";
import { useDebounce } from "./useDebounce";
import { toApiError } from "../api/client";

/**
 * Debounced GET /products fetcher shared by ShopPage and CategoryPage —
 * avoids firing a request on every keystroke/filter tweak (Section 12).
 */
export function useProductSearch(filters) {
  const debouncedFilters = useDebounce(filters, 400);
  const [state, setState] = useState({ products: [], meta: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    searchProducts(debouncedFilters)
      .then((res) => {
        if (cancelled) return;
        setState({ products: res.data, meta: res.meta, loading: false, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ products: [], meta: null, loading: false, error: toApiError(err) });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(debouncedFilters)]);

  return state;
}
