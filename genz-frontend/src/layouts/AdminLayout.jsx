import { useState } from "react";
import { Outlet } from "react-router-dom";
import AdminSidebar from "../components/admin/AdminSidebar";
import styles from "./AdminLayout.module.css";

export default function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className={styles.shell}>
      <div className={`${styles.sidebarWrap} ${mobileOpen ? styles.sidebarOpen : ""}`}>
        <AdminSidebar onNavigate={() => setMobileOpen(false)} />
      </div>
      {mobileOpen ? <div className={styles.overlay} onClick={() => setMobileOpen(false)} /> : null}

      <div className={styles.content}>
        <header className={styles.topbar}>
          <button
            type="button"
            className={styles.menuBtn}
            onClick={() => setMobileOpen(true)}
            aria-label="Open admin menu"
          >
            ☰
          </button>
          <span className={styles.topbarTitle}>Store Administration</span>
        </header>
        <div className={styles.page}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
