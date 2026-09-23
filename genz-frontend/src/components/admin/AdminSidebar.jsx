import { NavLink } from "react-router-dom";
import { useAdminAuth } from "../../context/AdminAuthContext";
import styles from "./AdminSidebar.module.css";

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [{ to: "/admin", label: "Dashboard", end: true }],
  },
  {
    label: "Catalogue — EP-01",
    items: [
      { to: "/admin/products", label: "Products" },
      { to: "/admin/categories", label: "Categories" },
    ],
  },
  {
    label: "Orders — EP-02",
    items: [{ to: "/admin/orders", label: "Orders" }],
  },
  {
    label: "Delivery & Reviews — EP-03",
    items: [
      { to: "/admin/deliveries", label: "Deliveries" },
      { to: "/admin/reviews", label: "Review Moderation" },
    ],
  },
  {
    label: "Store Administration — EP-04",
    items: [
      { to: "/admin/staff", label: "Staff" },
      { to: "/admin/roles", label: "Roles & Permissions" },
      { to: "/admin/settings", label: "Store Settings" },
      { to: "/admin/activity-log", label: "Activity Log" },
    ],
  },
];

export default function AdminSidebar({ onNavigate }) {
  const { logout } = useAdminAuth();

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        GEN-Z <span>Admin</span>
      </div>
      <nav className={styles.nav}>
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className={styles.group}>
            <p className={styles.groupLabel}>{group.label}</p>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) => `${styles.link} ${isActive ? styles.linkActive : ""}`}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <button type="button" className={styles.logout} onClick={logout}>
        Log out
      </button>
    </aside>
  );
}
