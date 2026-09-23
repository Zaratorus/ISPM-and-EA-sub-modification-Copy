import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { searchProducts } from "../api/products";
import { getProductReviews } from "../api/reviews";
import { useCategories } from "../hooks/useCategories";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import ProductGrid from "../components/product/ProductGrid";
import ReviewCard from "../components/product/ReviewCard";
import Button from "../components/ui/Button";
import ProductImage from "../components/ui/ProductImage";
import styles from "./HomePage.module.css";

export default function HomePage() {
  useDocumentTitle("Home");
  const { categories } = useCategories();
  const [products, setProducts] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    searchProducts({ page: 1, limit: 24 })
      .then((res) => !cancelled && setProducts(res.data))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const featured = useMemo(() => (products || []).slice(0, 8), [products]);

  // Hero and category imagery come from the real catalogue — no stock or
  // invented photography. Both degrade to the existing colour treatment when
  // a product has no image yet, so the layout never shows an empty frame.
  const heroImage = useMemo(() => {
    const withImage = (products || []).find((p) => p.images && p.images.length > 0);
    return withImage ? withImage.images[0].image_reference : null;
  }, [products]);

  const categoryImages = useMemo(() => {
    const map = {};
    for (const p of products || []) {
      if (!map[p.category_id] && p.images && p.images.length > 0) {
        map[p.category_id] = p.images[0].image_reference;
      }
    }
    return map;
  }, [products]);
  const newArrivals = useMemo(
    () =>
      [...(products || [])]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 8),
    [products]
  );

  // Real review data (Backend/API Architecture Design V1.0, Section 6:
  // GET /products/:id/reviews) — no "site-wide recent reviews" endpoint
  // exists, so this samples a couple of featured products' own approved
  // reviews rather than inventing one.
  const [homeReviews, setHomeReviews] = useState([]);
  useEffect(() => {
    if (featured.length === 0) return undefined;
    let cancelled = false;
    const sampleIds = featured.slice(0, 3).map((p) => p.product_id);
    Promise.all(sampleIds.map((id) => getProductReviews(id, { page: 1, limit: 2 }).catch(() => ({ data: [] }))))
      .then((results) => {
        if (cancelled) return;
        setHomeReviews(results.flatMap((r) => r.data).slice(0, 4));
      });
    return () => {
      cancelled = true;
    };
  }, [featured]);

  return (
    <div>
      {/* Hero */}
      <section className={styles.hero}>
        <div className={`${styles.heroInner} container`}>
          <div className={styles.heroContent}>
            <p className={styles.eyebrow}>Men&rsquo;s &amp; Boys&rsquo; Fashion — Est. Gen-Z</p>
            <h1 className={styles.heroTitle}>
              GEN-Z
              <span>Define Your Style.</span>
            </h1>
            <p className={styles.heroText}>
              Sharp menswear, effortless everyday pieces, and signature fragrances — built for a generation that
              dresses on its own terms.
            </p>
            <div className={styles.heroActions}>
              <Button to="/shop" variant="primary" size="lg">
                Shop Collection
              </Button>
              <Button to="/shop?q=perfume" variant="outlineLight" size="lg">
                Explore Fragrances
              </Button>
            </div>
          </div>

          <div className={styles.heroVisual} aria-hidden="true">
            {heroImage ? (
              <div className={styles.heroFrame}>
                <ProductImage imageReference={heroImage} alt="" eager className={styles.heroImg} />
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* Featured categories */}
      {categories.length > 0 ? (
        <section className={`${styles.section} container`}>
          <h2 className={styles.sectionTitle}>Shop by Category</h2>
          <div className={styles.categoryGrid}>
            {categories.slice(0, 4).map((cat, i) => (
              <Link key={cat.categoryId} to={`/category/${cat.categoryId}`} className={styles.categoryTile}>
                {categoryImages[cat.categoryId] ? (
                  <ProductImage
                    imageReference={categoryImages[cat.categoryId]}
                    alt=""
                    className={styles.categoryTileImg}
                  />
                ) : null}
                <span className={styles.categoryTileBody}>
                  <span className={styles.categoryTileTag}>{String(i + 1).padStart(2, "0")}</span>
                  <span className={styles.categoryTileName}>{cat.name}</span>
                  <span className={styles.categoryTileCta}>Shop now →</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Featured products */}
      <section className={`${styles.section} container`}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Featured Products</h2>
          <Link to="/shop" className={styles.sectionLink}>
            View all →
          </Link>
        </div>
        {products === null && !error ? (
          <ProductGrid loading skeletonCount={4} />
        ) : error ? (
          <p className={styles.errorText}>Unable to load products right now.</p>
        ) : (
          <ProductGrid products={featured} emptyMessage="New arrivals are on the way — check back soon." />
        )}
      </section>

      {/* New arrivals */}
      {newArrivals.length > 0 ? (
        <section className={`${styles.section} container`}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>New Arrivals</h2>
          </div>
          <ProductGrid products={newArrivals} />
        </section>
      ) : null}

      {/* Perfume spotlight */}
      <section className={styles.perfumeSection}>
        <div className={`${styles.perfumeInner} container`}>
          <p className={styles.eyebrowLight}>Fragrance Edit</p>
          <h2 className={styles.perfumeTitle}>Find Your Signature Scent</h2>
          <p className={styles.perfumeText}>
            A curated fragrance selection for every occasion — from everyday freshness to statement evening scents.
          </p>
          <Button to="/shop?q=perfume" variant="outlineLight" size="lg">
            Explore Perfumes
          </Button>
        </div>
      </section>

      {/* Why choose Gen-Z */}
      <section className={styles.benefitsBand}>
        <div className={`${styles.section} container`}>
          <h2 className={styles.sectionTitle}>Why Choose Gen-Z</h2>
          <div className={styles.benefitsGrid}>
            <Benefit title="Quality Products" text="Carefully selected menswear and fragrances." />
            <Benefit title="Modern Styles" text="Fresh, contemporary pieces for every occasion." />
            <Benefit title="Affordable Pricing" text="Premium style without the premium markup." />
            <Benefit title="Easy Ordering" text="Simple browsing, cart and checkout, start to finish." />
            <Benefit title="Customer Support" text="Reach us directly on WhatsApp with any questions." />
          </div>
        </div>
      </section>

      {/* Customer reviews */}
      {homeReviews.length > 0 ? (
        <section className={`${styles.section} container`}>
          <h2 className={styles.sectionTitle}>What Customers Say</h2>
          <div className={styles.reviewsGrid}>
            {homeReviews.map((review) => (
              <div key={review.reviewId} className={styles.reviewCardWrap}>
                <ReviewCard review={review} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Final CTA */}
      <section className={styles.finalCta}>
        <div className="container">
          <h2 className={styles.finalCtaTitle}>Ready to define your style?</h2>
          <Button to="/shop" variant="primary" size="lg">
            Start Shopping
          </Button>
        </div>
      </section>
    </div>
  );
}

function Benefit({ title, text }) {
  return (
    <div className={styles.benefit}>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
