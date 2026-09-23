import { useEffect, useState } from "react";
import { getPublicSettings } from "../api/settings";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import Button from "../components/ui/Button";
import styles from "./InfoPage.module.css";

export default function ContactPage() {
  useDocumentTitle("Contact");
  const [settings, setSettings] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getPublicSettings()
      .then(setSettings)
      .finally(() => setLoaded(true));
  }, []);

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className="container">
          <p className={styles.eyebrow}>Get in Touch</p>
          <h1>Contact Us</h1>
          <p className={styles.lead}>Questions about an order, a product, or anything else? Reach out any time.</p>
        </div>
      </section>

      <section className={`${styles.section} container`}>
        {!loaded ? (
          <LoadingSpinner label="Loading contact details…" />
        ) : settings?.whatsappNumber ? (
          <div className={styles.contactCard}>
            <h2>WhatsApp</h2>
            <p>The fastest way to reach us — message us directly for order help, sizing questions, or anything else.</p>
            <Button href={`https://wa.me/${settings.whatsappNumber.replace(/\D/g, "")}`} variant="primary" size="lg">
              Message on WhatsApp
            </Button>
          </div>
        ) : (
          <p className={styles.fallback}>Contact details will be available here soon.</p>
        )}
      </section>
    </div>
  );
}
