import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useCategories } from "../../hooks/useCategories";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { useCart } from "../../context/CartContext";
import SearchOverlay from "../search/SearchOverlay";
import styles from "./Navbar.module.css";

// Slot count + widths (in ch, so they scale with the nav's own font) for the
// category-link skeleton. Calibrated to the current live categories (Men's
// Clothing / Kids' Clothing / Perfumes) so the header doesn't reflow once
// useCategories() resolves — update this if the catalogue's categories change.
const CATEGORY_SKELETON_WIDTHS = ["9ch", "14ch", "14ch"];

export default function Navbar() {
  const { categories, loading: categoriesLoading } = useCategories();
  const { isAuthenticated, customer } = useCustomerAuth();
  const { itemCount } = useCart();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
    setSearchOpen(false);
  }, [navigate]);

  // Lock the page behind the drawer and let Escape close it — the same
  // dialog contract SearchOverlay uses.
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(e) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

  const navLinkClass = ({ isActive }) => `${styles.link} ${isActive ? styles.linkActive : ""}`;

  return (
    <header className={styles.header}>
      <div className={`${styles.bar} container`}>
        <button
          type="button"
          className={styles.hamburger}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          <span className={mobileOpen ? styles.hamburgerOpen : ""} />
        </button>

        <Link to="/" className={styles.logo} aria-label="Gen-Z home">
          <span className={styles.logoMark}>
            GEN<span className={styles.logoAccent}>-</span>Z
          </span>
          <span className={styles.logoTagline}>Men&rsquo;s &middot; Kids&rsquo; &middot; Fragrance</span>
        </Link>

        <nav className={styles.desktopNav} aria-label="Primary" aria-busy={categoriesLoading}>
          <NavLink to="/" end className={navLinkClass}>
            Home
          </NavLink>
          {categoriesLoading
            ? CATEGORY_SKELETON_WIDTHS.map((width, i) => (
                <span key={i} className={styles.linkSkeleton} style={{ width }} aria-hidden="true" />
              ))
            : categories.slice(0, 4).map((cat) => (
                <NavLink key={cat.categoryId} to={`/category/${cat.categoryId}`} className={navLinkClass}>
                  {cat.name}
                </NavLink>
              ))}
          <NavLink to="/about" className={navLinkClass}>
            About
          </NavLink>
          <NavLink to="/contact" className={navLinkClass}>
            Contact
          </NavLink>
        </nav>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Search"
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((v) => !v)}
          >
            <SearchIcon />
          </button>
          <Link to={isAuthenticated ? "/account" : "/login"} className={styles.iconBtn} aria-label="Account">
            <UserIcon />
            {isAuthenticated ? <span className={styles.accountName}>{customer.name.split(" ")[0]}</span> : null}
          </Link>
          <Link to="/cart" className={styles.iconBtn} aria-label={`Cart, ${itemCount} item(s)`}>
            <CartIcon />
            {itemCount > 0 ? <span className={styles.cartBadge}>{itemCount}</span> : null}
          </Link>
        </div>
      </div>

      {searchOpen ? <SearchOverlay onClose={() => setSearchOpen(false)} /> : null}

      {mobileOpen ? (
        <div className={styles.mobileOverlay} role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            className={styles.mobileBackdrop}
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />

          <div className={styles.mobileDrawer}>
            <div className={styles.mobileTopRow}>
              <span className={styles.mobileKicker}>Menu</span>
              <button
                type="button"
                className={styles.mobileClose}
                aria-label="Close menu"
                onClick={() => setMobileOpen(false)}
              >
                <CloseIcon />
              </button>
            </div>

            <nav className={styles.mobileLinks} aria-label="Mobile">
              <NavLink to="/" end className={navLinkClass} onClick={() => setMobileOpen(false)}>
                Home
              </NavLink>
              {categories.map((cat) => (
                <NavLink
                  key={cat.categoryId}
                  to={`/category/${cat.categoryId}`}
                  className={navLinkClass}
                  onClick={() => setMobileOpen(false)}
                >
                  {cat.name}
                </NavLink>
              ))}
              <NavLink to="/about" className={navLinkClass} onClick={() => setMobileOpen(false)}>
                About
              </NavLink>
              <NavLink to="/contact" className={navLinkClass} onClick={() => setMobileOpen(false)}>
                Contact
              </NavLink>
            </nav>

            <div className={styles.mobileDivider} />

            <div className={styles.mobileUtilities}>
              <Link
                to={isAuthenticated ? "/account" : "/login"}
                className={styles.mobileUtilityLink}
                onClick={() => setMobileOpen(false)}
              >
                <UserIcon />
                {isAuthenticated ? `My Account — ${customer.name.split(" ")[0]}` : "Login / Register"}
              </Link>
              <Link to="/cart" className={styles.mobileUtilityLink} onClick={() => setMobileOpen(false)}>
                <CartIcon />
                Cart
                {itemCount > 0 ? <span className={styles.mobileCartBadge}>{itemCount}</span> : null}
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M5 5l14 14M19 5L5 19" strokeLinecap="round" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" strokeLinecap="round" />
    </svg>
  );
}
function CartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 4h2l2.2 12.4a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21 8H6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9.5" cy="21" r="1.4" />
      <circle cx="17.5" cy="21" r="1.4" />
    </svg>
  );
}
