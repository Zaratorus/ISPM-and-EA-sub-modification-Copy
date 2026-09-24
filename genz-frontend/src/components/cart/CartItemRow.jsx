import { Link } from "react-router-dom";
import { useState } from "react";
import ProductImage from "../ui/ProductImage";
import QuantitySelector from "../ui/QuantitySelector";
import Badge from "../ui/Badge";
import { formatCurrency } from "../../utils/format";
import { useCart } from "../../context/CartContext";
import styles from "./CartItemRow.module.css";

export default function CartItemRow({ item }) {
  const { updateQuantity, removeItem } = useCart();
  const [busy, setBusy] = useState(false);
  const product = item.product;
  const outOfStock = product?.availability_status === "OUT_OF_STOCK";

  async function handleQuantityChange(next) {
    setBusy(true);
    await updateQuantity(item.cartItemId, next);
    setBusy(false);
  }

  async function handleRemove() {
    setBusy(true);
    await removeItem(item.cartItemId);
  }

  if (!product) {
    return (
      <div className={styles.row}>
        <div className={styles.unavailable}>
          <p>This product is no longer available.</p>
          <button type="button" className={styles.removeLink} onClick={handleRemove} disabled={busy}>
            Remove
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.row}>
      <Link to={`/products/${product.product_id}`} className={styles.imageLink}>
        <ProductImage imageReference={product.images?.[0]?.image_reference} alt={product.name} className={styles.image} />
      </Link>

      <div className={styles.info}>
        <Link to={`/products/${product.product_id}`} className={styles.name}>
          {product.name}
        </Link>
        {item.variantLabel ? <p className={styles.variant}>Size: {item.variantLabel}</p> : null}
        <p className={styles.unitPrice}>{formatCurrency(product.price)} each</p>
        {outOfStock ? <Badge tone="error">Out of Stock</Badge> : null}
      </div>

      <div className={styles.qty}>
        <QuantitySelector value={item.quantity} onChange={handleQuantityChange} disabled={busy || outOfStock} />
      </div>

      <div className={styles.lineTotal}>{formatCurrency(Number(product.price) * item.quantity)}</div>

      <button type="button" className={styles.removeBtn} onClick={handleRemove} disabled={busy} aria-label="Remove item">
        ×
      </button>
    </div>
  );
}
