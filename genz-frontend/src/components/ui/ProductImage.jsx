import { useState } from "react";
import { resolveImageUrl } from "../../utils/format";
import styles from "./ProductImage.module.css";

/**
 * Renders a product image, or a styled monogram placeholder when no
 * resolvable image exists / it fails to load — never a broken-image icon.
 */
export default function ProductImage({ imageReference, alt, className = "", eager = false }) {
  const [failed, setFailed] = useState(false);
  const src = resolveImageUrl(imageReference);
  const showPlaceholder = !src || failed;

  if (showPlaceholder) {
    const initial = (alt || "GZ").trim().charAt(0).toUpperCase() || "G";
    return (
      <div className={`${styles.placeholder} ${className}`} role="img" aria-label={alt || "Product image"}>
        <span>{initial}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt || ""}
      className={`${styles.img} ${className}`}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
