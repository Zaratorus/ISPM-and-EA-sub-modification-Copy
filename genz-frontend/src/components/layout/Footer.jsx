import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { getPublicSettings } from "../../api/settings";
import { shopInfo, hasAny } from "../../config/shopInfo";
import styles from "./Footer.module.css";

/** Internal routes use <Link>; anything starting with http uses <a>. */
function PolicyLink({ to, children }) {
  if (/^https?:\/\//i.test(to)) {
    return (
      <a href={to} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  }
  return <Link to={to}>{children}</Link>;
}

export default function Footer() {
  const [whatsappNumber, setWhatsappNumber] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getPublicSettings()
      .then((s) => !cancelled && setWhatsappNumber(s.whatsappNumber))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <footer className={styles.footer}>
      <div className={`${styles.top} container`}>
        <div className={styles.brandCol}>
          <span className={styles.logo}>GEN-Z</span>
          <p className={styles.tagline}>
            Modern men&rsquo;s fashion and signature fragrances — for boys and gents who define their own style.
          </p>
        </div>

        <div className={styles.col}>
          <h4>Shop</h4>
          <ul>
            <li>
              <Link to="/shop">All Products</Link>
            </li>
            <li>
              <Link to="/shop?q=perfume">Perfumes</Link>
            </li>
            <li>
              <Link to="/cart">Cart</Link>
            </li>
          </ul>
        </div>

        <div className={styles.col}>
          <h4>Company</h4>
          <ul>
            <li>
              <Link to="/about">About Gen-Z</Link>
            </li>
            <li>
              <Link to="/contact">Contact</Link>
            </li>
            <li>
              <Link to="/account/orders">Track an Order</Link>
            </li>
          </ul>
        </div>

        {/* Rendered only when the owner fills in src/config/shopInfo.js —
            nothing here is placeholder text on the live site. */}
        {hasAny(shopInfo.policies) ? (
          <div className={styles.col}>
            <h4>Customer Care</h4>
            <ul>
              {shopInfo.policies.delivery ? (
                <li>
                  <PolicyLink to={shopInfo.policies.delivery}>Delivery Information</PolicyLink>
                </li>
              ) : null}
              {shopInfo.policies.returns ? (
                <li>
                  <PolicyLink to={shopInfo.policies.returns}>Returns &amp; Exchanges</PolicyLink>
                </li>
              ) : null}
              {shopInfo.policies.privacy ? (
                <li>
                  <PolicyLink to={shopInfo.policies.privacy}>Privacy Policy</PolicyLink>
                </li>
              ) : null}
              {shopInfo.policies.terms ? (
                <li>
                  <PolicyLink to={shopInfo.policies.terms}>Terms &amp; Conditions</PolicyLink>
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}

        <div className={styles.col}>
          <h4>Get in Touch</h4>
          <ul>
            {whatsappNumber ? (
              <li>
                <a href={`https://wa.me/${whatsappNumber.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
                  WhatsApp: {whatsappNumber}
                </a>
              </li>
            ) : null}
            {shopInfo.phone ? (
              <li>
                <a href={`tel:${shopInfo.phone.replace(/\s/g, "")}`}>{shopInfo.phone}</a>
              </li>
            ) : null}
            {shopInfo.email ? (
              <li>
                <a href={`mailto:${shopInfo.email}`}>{shopInfo.email}</a>
              </li>
            ) : null}
            {shopInfo.address ? <li className={styles.plain}>{shopInfo.address}</li> : null}
            {shopInfo.openingHours ? <li className={styles.plain}>{shopInfo.openingHours}</li> : null}
            <li>
              <Link to="/admin/login">Store Admin</Link>
            </li>
          </ul>

          {hasAny(shopInfo.social) ? (
            <div className={styles.social}>
              {shopInfo.social.facebook ? (
                <a href={shopInfo.social.facebook} target="_blank" rel="noreferrer">
                  Facebook
                </a>
              ) : null}
              {shopInfo.social.instagram ? (
                <a href={shopInfo.social.instagram} target="_blank" rel="noreferrer">
                  Instagram
                </a>
              ) : null}
              {shopInfo.social.tiktok ? (
                <a href={shopInfo.social.tiktok} target="_blank" rel="noreferrer">
                  TikTok
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {shopInfo.deliveryNote ? (
        <div className={styles.noteBar}>
          <div className="container">
            <p>{shopInfo.deliveryNote}</p>
          </div>
        </div>
      ) : null}

      <div className={styles.bottom}>
        <div className="container">
          <p>© {new Date().getFullYear()} Gen-Z Digital Storefront. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
