import { useEffect, useState } from "react";
import { getPublicSettings } from "../../api/settings";
import styles from "./WhatsAppButton.module.css";

/**
 * Floating WhatsApp contact button.
 *
 * The number comes from the store settings the backend already exposes
 * (GET /settings — the same source the footer link uses); nothing is
 * hardcoded and no new endpoint is introduced. When no number is configured
 * the button renders nothing rather than linking somewhere invalid.
 */
export default function WhatsAppButton() {
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

  const digits = (whatsappNumber || "").replace(/\D/g, "");
  if (!digits) return null;

  return (
    <a
      href={`https://wa.me/${digits}`}
      target="_blank"
      rel="noreferrer"
      className={styles.fab}
      aria-label="Chat with Gen-Z on WhatsApp"
    >
      <span className={styles.halo} aria-hidden="true" />
      <svg viewBox="0 0 24 24" className={styles.icon} fill="currentColor" aria-hidden="true">
        <path d="M20.52 3.48A11.86 11.86 0 0 0 12.08 0C5.52 0 .18 5.34.18 11.9c0 2.1.55 4.15 1.6 5.95L.1 24l6.3-1.65a11.9 11.9 0 0 0 5.68 1.45h.01c6.56 0 11.9-5.34 11.9-11.9 0-3.18-1.24-6.17-3.47-8.42ZM12.09 21.8h-.01a9.9 9.9 0 0 1-5.05-1.38l-.36-.21-3.74.98 1-3.65-.23-.37a9.86 9.86 0 0 1-1.52-5.27C2.18 6.45 6.62 2 12.08 2c2.65 0 5.14 1.04 7.01 2.92a9.84 9.84 0 0 1 2.91 7.01c0 5.46-4.45 9.9-9.91 9.9Zm5.43-7.42c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-1.76-.88-2.91-1.57-4.06-3.56-.31-.54.31-.5.89-1.67.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.03 1-1.03 2.44s1.06 2.83 1.21 3.02c.15.2 2.08 3.18 5.04 4.46 1.87.81 2.6.88 3.53.74.57-.09 1.76-.72 2.01-1.41.25-.69.25-1.28.17-1.4-.07-.12-.27-.2-.57-.35Z" />
      </svg>
    </a>
  );
}
