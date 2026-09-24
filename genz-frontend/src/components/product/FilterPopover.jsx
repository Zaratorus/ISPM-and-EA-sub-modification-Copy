import { useEffect, useRef } from "react";
import styles from "./FilterPopover.module.css";

/**
 * One pill trigger + floating popover panel, used by ShopFilterBar for
 * Category / Brand / Size-Age / Price. Only one popover is meant to be
 * open across the bar at a time — coordinated by the parent via
 * `open`/`onOpenChange` rather than local state, so opening one closes
 * whichever other one was open.
 */
export default function FilterPopover({ label, active, open, onOpenChange, children }) {
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) onOpenChange(false);
    }
    function onKeyDown(e) {
      if (e.key === "Escape") onOpenChange(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={`${styles.trigger} ${active ? styles.triggerActive : ""}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        {label}
        <ChevronIcon open={open} />
      </button>
      {open ? (
        <div className={styles.panel} role="dialog" aria-label={typeof label === "string" ? label : undefined}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

function ChevronIcon({ open }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      className={styles.chevron}
      style={{ transform: open ? "rotate(180deg)" : "none" }}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
