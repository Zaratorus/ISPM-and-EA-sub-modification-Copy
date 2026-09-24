import { useDocumentTitle } from "../hooks/useDocumentTitle";
import Button from "../components/ui/Button";
import styles from "./InfoPage.module.css";

export default function AboutPage() {
  useDocumentTitle("About Gen-Z");

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className="container">
          <p className={styles.eyebrow}>Our Story</p>
          <h1>About Gen-Z</h1>
          <p className={styles.lead}>
            Gen-Z is a men&rsquo;s and kids&rsquo; fashion destination built around sharp, wearable style and a
            curated fragrance edit — for a generation that dresses with intention.
          </p>
        </div>
      </section>

      <section className={`${styles.section} container`}>
        <div className={styles.grid}>
          <div>
            <h2>What We Offer</h2>
            <p>
              From everyday essentials to statement pieces, Gen-Z brings together modern menswear and a
              hand-picked perfume selection in one straightforward storefront — simple browsing, clear pricing, and
              an easy path from discovery to checkout.
            </p>
          </div>
          <div>
            <h2>How to Shop</h2>
            <p>
              Browse the collection or search directly, add what you like to your cart, and check out with your
              delivery address. We&rsquo;ll confirm every order with you directly over WhatsApp.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.cta}>
        <div className="container">
          <h2>Explore the Collection</h2>
          <Button to="/shop" variant="primary" size="lg">
            Shop Now
          </Button>
        </div>
      </section>
    </div>
  );
}
