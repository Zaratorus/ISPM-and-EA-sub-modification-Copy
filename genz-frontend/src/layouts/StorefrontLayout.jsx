import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import WhatsAppButton from "../components/layout/WhatsAppButton";
import LoadingSpinner from "../components/ui/LoadingSpinner";

export default function StorefrontLayout() {
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <Navbar />
      <main id="main-content" style={{ flex: 1 }}>
        {/* A Suspense boundary here — rather than only around <Routes> —
            keeps the header and footer on screen while a lazy page chunk
            loads, instead of blanking the whole window. */}
        <Suspense
          fallback={
            <div className="container" style={{ paddingBlock: "var(--space-9)" }}>
              <LoadingSpinner label="Loading…" />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}
