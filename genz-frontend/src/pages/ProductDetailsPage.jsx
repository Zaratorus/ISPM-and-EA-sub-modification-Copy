import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { getProduct, searchProducts } from "../api/products";
import { getProductReviews, submitReview, listMyReviews } from "../api/reviews";
import { listMyOrders, getOrder } from "../api/orders";
import { getDeliveryByOrder } from "../api/deliveries";
import { formatCurrency } from "../utils/format";
import { useCategories } from "../hooks/useCategories";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useCart } from "../context/CartContext";
import { useCustomerAuth } from "../context/CustomerAuthContext";
import { useToast } from "../context/ToastContext";
import { toApiError } from "../api/client";
import ProductImage from "../components/ui/ProductImage";
import QuantitySelector from "../components/ui/QuantitySelector";
import StarRating from "../components/ui/StarRating";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import ErrorState from "../components/ui/ErrorState";
import Breadcrumb from "../components/ui/Breadcrumb";
import ReviewCard from "../components/product/ReviewCard";
import ProductGrid from "../components/product/ProductGrid";
import formStyles from "../components/forms/Form.module.css";
import styles from "./ProductDetailsPage.module.css";

export default function ProductDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useCustomerAuth();
  const { addItem } = useCart();
  const { showToast } = useToast();
  const { categories } = useCategories();

  const [product, setProduct] = useState(null);
  const [error, setError] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [adding, setAdding] = useState(false);
  const [related, setRelated] = useState([]);

  const [reviews, setReviews] = useState({ data: [], meta: null, loading: true });
  const [eligibleOrders, setEligibleOrders] = useState([]);
  const [myProductReviews, setMyProductReviews] = useState([]);
  const [checkingEligibility, setCheckingEligibility] = useState(false);

  const load = useCallback(() => {
    setProduct(null);
    setError(null);
    getProduct(id)
      .then(setProduct)
      .catch((err) => setError(toApiError(err)));
  }, [id]);

  useEffect(load, [load]);
  useDocumentTitle(product?.name);

  useEffect(() => {
    setActiveImage(0);
  }, [id]);

  // Reviews (public — approved only)
  useEffect(() => {
    let cancelled = false;
    setReviews((s) => ({ ...s, loading: true }));
    getProductReviews(id, { page: 1, limit: 20 })
      .then((res) => !cancelled && setReviews({ data: res.data, meta: res.meta, loading: false }))
      .catch(() => !cancelled && setReviews({ data: [], meta: null, loading: false }));
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Related products (same category)
  useEffect(() => {
    if (!product?.category_id) return undefined;
    let cancelled = false;
    searchProducts({ categoryId: product.category_id, limit: 8 })
      .then((res) => !cancelled && setRelated(res.data.filter((p) => p.product_id !== Number(id)).slice(0, 4)))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [product, id]);

  // Review eligibility: an order of this customer's, containing this
  // product, whose Delivery has reached DELIVERED (System Architecture
  // V1.2, Section 11/12 — verified-purchase + Delivered eligibility).
  useEffect(() => {
    if (!isAuthenticated) {
      setEligibleOrders([]);
      return undefined;
    }
    let cancelled = false;
    setCheckingEligibility(true);

    async function checkOrderEligibility(orderSummary) {
      const full = await getOrder(orderSummary.orderId, "customer");
      const hasProduct = full.items.some((item) => item.productId === Number(id));
      if (!hasProduct) return null;
      try {
        const delivery = await getDeliveryByOrder(orderSummary.orderId);
        return delivery.status === "DELIVERED" ? orderSummary.orderId : null;
      } catch {
        return null; // No delivery record yet for this order.
      }
    }

    // An order the customer has already reviewed this product for (an active,
    // non-deleted review) is not offered again — that review is edited from My Reviews.
    Promise.all([
      listMyOrders({ page: 1, limit: 10 }).then(({ data: orders }) => {
        const candidates = orders.filter((o) => o.status !== "CANCELLED");
        return Promise.all(candidates.map((order) => checkOrderEligibility(order).catch(() => null)));
      }),
      listMyReviews({ page: 1, limit: 100 })
        .then((res) => res.data)
        .catch(() => []),
    ])
      .then(([results, mine]) => {
        if (cancelled) return;
        const reviewedHere = mine.filter((review) => review.productId === Number(id));
        const reviewedOrders = new Set(reviewedHere.map((review) => review.orderId));
        setMyProductReviews(reviewedHere);
        setEligibleOrders(results.filter(Boolean).filter((orderId) => !reviewedOrders.has(orderId)));
      })
      .finally(() => {
        if (!cancelled) setCheckingEligibility(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, id]);

  async function handleAddToCart() {
    setAdding(true);
    const result = await addItem(product.product_id, quantity);
    setAdding(false);
    return result.ok;
  }

  async function handleBuyNow() {
    if (!isAuthenticated) {
      navigate("/login", { state: { from: { pathname: `/products/${id}` } } });
      return;
    }
    const ok = await handleAddToCart();
    if (ok) navigate("/checkout");
  }

  if (error) {
    return (
      <div className="container">
        <ErrorState
          title={error.status === 404 ? "Product not found" : "Unable to load this product"}
          message={error.message}
          onRetry={load}
        />
      </div>
    );
  }

  if (!product) {
    return <LoadingSpinner fullPage label="Loading product…" />;
  }

  const inStock = product.availability_status !== "OUT_OF_STOCK";
  const category = categories.find((c) => c.categoryId === product.category_id);
  const images = product.images?.length ? product.images : [null];

  return (
    <div className={`${styles.page} container`}>
      <Breadcrumb
        items={[
          { label: "Home", to: "/" },
          { label: "Shop", to: "/shop" },
          category ? { label: category.name, to: `/category/${category.categoryId}` } : null,
          { label: product.name },
        ]}
      />

      <div className={styles.layout}>
        <div className={styles.gallery}>
          <div className={styles.mainImage}>
            <ProductImage
              imageReference={images[activeImage]?.image_reference}
              alt={product.name}
              eager
            />
          </div>
          {images.length > 1 ? (
            <div className={styles.thumbRow}>
              {images.map((img, i) => (
                <button
                  key={img?.product_image_id || i}
                  type="button"
                  className={`${styles.thumb} ${i === activeImage ? styles.thumbActive : ""}`}
                  onClick={() => setActiveImage(i)}
                >
                  <ProductImage imageReference={img?.image_reference} alt={`${product.name} thumbnail ${i + 1}`} />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className={styles.info}>
          {category ? <Badge tone="brand">{category.name}</Badge> : null}
          <h1 className={styles.title}>{product.name}</h1>

          {reviews.meta?.averageRating ? (
            <div className={styles.ratingRow}>
              <StarRating value={reviews.meta.averageRating} />
              <span>
                {Number(reviews.meta.averageRating).toFixed(1)} ({reviews.meta.total} review
                {reviews.meta.total === 1 ? "" : "s"})
              </span>
            </div>
          ) : null}

          <p className={styles.price}>{formatCurrency(product.price)}</p>

          <p className={styles.availability}>
            {inStock ? (
              <Badge tone="success">In Stock{product.stock_quantity != null ? ` · ${product.stock_quantity} available` : ""}</Badge>
            ) : (
              <Badge tone="error">Out of Stock</Badge>
            )}
          </p>

          {product.description ? <p className={styles.description}>{product.description}</p> : null}

          <div className={styles.buyRow}>
            <QuantitySelector value={quantity} onChange={setQuantity} max={product.stock_quantity || 99} disabled={!inStock} />
            <Button variant="dark" size="lg" onClick={handleAddToCart} loading={adding} disabled={!inStock}>
              Add to Cart
            </Button>
          </div>
          <Button variant="primary" size="lg" className={styles.buyNow} onClick={handleBuyNow} disabled={!inStock}>
            Buy Now
          </Button>

          {!isAuthenticated ? (
            <p className={styles.loginHint}>
              <Link to="/login">Log in</Link> to add items to your cart and check out.
            </p>
          ) : null}
        </div>
      </div>

      {/* Reviews */}
      <section className={styles.reviewsSection}>
        <h2>Customer Reviews</h2>

        {isAuthenticated ? (
          <ReviewComposer
            productId={Number(id)}
            eligibleOrders={eligibleOrders}
            alreadyReviewed={myProductReviews.length > 0}
            checking={checkingEligibility}
            onSubmitted={(orderId) => {
              setEligibleOrders((orders) => orders.filter((o) => o !== orderId));
              setMyProductReviews((mine) => [...mine, { orderId, productId: Number(id) }]);
              showToast("Thanks — your review has been submitted for moderation.", "success");
              getProductReviews(id, { page: 1, limit: 20 }).then((res) =>
                setReviews({ data: res.data, meta: res.meta, loading: false })
              );
            }}
          />
        ) : null}

        {reviews.loading ? (
          <LoadingSpinner label="Loading reviews…" />
        ) : reviews.data.length === 0 ? (
          <p className={styles.noReviews}>No reviews yet — be the first to share your experience.</p>
        ) : (
          <div className={styles.reviewList}>
            {reviews.data.map((review) => (
              <ReviewCard key={review.reviewId} review={review} />
            ))}
          </div>
        )}
      </section>

      {/* Related products */}
      {related.length > 0 ? (
        <section className={styles.relatedSection}>
          <h2>You May Also Like</h2>
          <ProductGrid products={related} />
        </section>
      ) : null}
    </div>
  );
}

function ReviewComposer({ productId, eligibleOrders, alreadyReviewed, checking, onSubmitted }) {
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const { showToast } = useToast();

  if (checking) return <p className={styles.eligibilityNote}>Checking your order history…</p>;
  if (eligibleOrders.length === 0 && alreadyReviewed) {
    return (
      <p className={styles.eligibilityNote}>
        You've already reviewed this product. You can edit or delete your review in{" "}
        <Link to="/account">My Reviews</Link>.
      </p>
    );
  }
  if (eligibleOrders.length === 0) {
    return (
      <p className={styles.eligibilityNote}>
        Your review form will appear here once an order containing this product has been delivered to you.
      </p>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const orderId = eligibleOrders[0];
      await submitReview({ orderId, productId, rating, reviewText: text.trim() || undefined });
      setText("");
      setRating(5);
      onSubmitted(orderId);
    } catch (err) {
      const apiError = toApiError(err);
      setFormError(apiError.message);
      showToast(apiError.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.reviewForm} onSubmit={handleSubmit}>
      <p className={styles.reviewFormLabel}>Your rating</p>
      <StarRating value={rating} onChange={setRating} size="lg" />
      <textarea
        className={formStyles.textarea}
        placeholder="Share your experience with this product (optional)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={2000}
      />
      {formError ? <p className={formStyles.error}>{formError}</p> : null}
      <Button type="submit" variant="primary" loading={submitting}>
        Submit Review
      </Button>
    </form>
  );
}
