import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import ProductImage from "../ui/ProductImage";
import Badge from "../ui/Badge";
import { formatCurrency } from "../../utils/format";
import { useCart } from "../../context/CartContext";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import styles from "./ProductCard.module.css";

export default function ProductCard({ product }) {
  const { isAuthenticated } = useCustomerAuth();
  const { addItem } = useCart();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);

  const inStock = product.availability_status !== "OUT_OF_STOCK";
  const image = product.images?.[0]?.image_reference;

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
          <button
            type="button"
            className={styles.addBtn}
            onClick={handleAddToCart}
            disabled={!inStock || adding}
            aria-label={`Add ${product.name} to cart`}
          >
            {adding ? "…" : "+"}
          </button>
        </div>
      </div>
    </Link>
  );
}
