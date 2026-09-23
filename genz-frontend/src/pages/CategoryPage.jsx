import { Navigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { listCategories } from "../api/categories";
import ShopPage from "./ShopPage";

/**
 * A category id is only valid if it is a positive whole number — the same
 * shape the API accepts (`categoryId` must be a whole number > 0).
 *
 * Without this check, values such as "undefined", "abc" or "1.5" became NaN,
 * which is falsy, so ShopPage applied no category filter at all and rendered
 * the entire catalogue under a generic "Category" heading.
 */
function parseCategoryId(raw) {
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export default function CategoryPage() {
  const { categoryId } = useParams();
  const parsedId = parseCategoryId(categoryId);
  const [categoryName, setCategoryName] = useState(null);

  useEffect(() => {
    if (parsedId === null) return undefined;
    let cancelled = false;
    listCategories()
      .then((cats) => {
        if (cancelled) return;
        const match = cats.find((c) => c.categoryId === parsedId);
        setCategoryName(match?.name || "Category");
      })
      .catch(() => !cancelled && setCategoryName("Category"));
    return () => {
      cancelled = true;
    };
  }, [parsedId]);

  // Malformed id: send the visitor to the shop rather than showing the whole
  // catalogue dressed up as the category they asked for. `replace` keeps the
  // bad URL out of the history stack.
  if (parsedId === null) {
    return <Navigate to="/shop" replace />;
  }

  return <ShopPage fixedCategoryId={parsedId} pageTitle={categoryName || "Loading…"} />;
}
