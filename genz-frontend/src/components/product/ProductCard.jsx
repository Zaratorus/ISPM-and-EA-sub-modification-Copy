import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import ProductImage from "../ui/ProductImage";
import Badge from "../ui/Badge";
import { formatCurrency } from "../../utils/format";
import { useCart } from "../../context/CartContext";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { useCategories } from "../../hooks/useCategories";
import { labelsForVariantType } from "../../config/variants";
import styles from "./ProductCard.module.css";

export default function ProductCard({ product }) {
  const { isAuthenticated } = useCustomerAuth();
  const { addItem } = useCart();
  const { categories, loading: categoriesLoading } = useCategories();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);

  const inStock = product.availability_status !== "OUT_OF_STOCK";
  const image = product.images?.[0]?.image_reference;

  // A quick-add with no variant would silently create an unsized cart line
  // for a product whose category requires a Size/Age choice (the PDP's
  // ProductDetailsPage.jsx variant gate). Until categories have loaded we
  // don't yet know which this is, so default to hiding the button rather
  // than risk a brief window where it quick-adds without a selection.
  const category = categories.find((c) => c.categoryId === product.category_id);
  const needsVariant = labelsForVariantType(category?.variantType).length > 0;
  const canQuickAdd = !categoriesLoading && !needsVariant;

  async function handleAddToCart(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      navigate("/login", { state: { from: { pathname: "/shop" } } });
      return;
    }
    setAdding(true);
    await addItem(product.product_id, 1);
    setAdding(false);
  }

  return (
    <Link
      to={`/products/${product.product_id}`}
      className={`${styles.card} ${!inStock ? styles.cardOut : ""}`}
    >
      <div className={styles.imageWrap}>
        <ProductImage imageReference={image} alt={product.name} className={styles.image} />
        {!inStock ? (
          <span className={styles.stockOverlay}>
            <Badge tone="error">Out of Stock</Badge>
          </span>
        ) : null}
      </div>
      <div className={styles.body}>
        <p className={styles.name}>{product.name}</p>
        <div className={styles.footer}>
          <span className={styles.price}>{formatCurrency(product.price)}</span>
          {canQuickAdd ? (
            <button
              type="button"
              className={styles.addBtn}
              onClick={handleAddToCart}
              disabled={!inStock || adding}
              aria-label={`Add ${product.name} to cart`}
            >
              {adding ? "…" : "+"}
            </button>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
