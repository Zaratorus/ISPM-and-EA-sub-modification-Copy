import { useEffect, useState } from "react";
import { listCategories } from "../api/categories";

// Module-level cache: GET /categories is called from the Navbar and the
// Shop filters simultaneously — fetch it once per page load, not per
// component instance, to avoid duplicate API calls (Section 12).
let cachePromise = null;

function fetchCategoriesOnce() {
  if (!cachePromise) cachePromise = listCategories();
  return cachePromise;
}

export function useCategories() {
  const [categories, setCategories] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchCategoriesOnce()
      .then((data) => {
        if (!cancelled) setCategories(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { categories: categories || [], loading: categories === null && !error, error };
}
