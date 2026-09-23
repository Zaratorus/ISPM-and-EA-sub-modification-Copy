import { useEffect, useState } from "react";
import { listRoles, createRole, listPermissions, assignPermissionsToRole } from "../../api/roles";
import { toApiError } from "../../api/client";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useToast } from "../../context/ToastContext";
import AdminPageHeader from "../../components/admin/AdminPageHeader";
import Button from "../../components/ui/Button";
import FormField from "../../components/forms/FormField";
import formStyles from "../../components/forms/Form.module.css";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import ErrorState from "../../components/ui/ErrorState";

export default function AdminRolesPage() {
  useDocumentTitle("Roles & Permissions");
  const { showToast } = useToast();
  const [roles, setRoles] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [error, setError] = useState(null);
  const [newRoleName, setNewRoleName] = useState("");
  const [creating, setCreating] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [selectedPermissionIds, setSelectedPermissionIds] = useState([]);
  const [assigning, setAssigning] = useState(false);

  function load() {
    setError(null);
    Promise.all([listRoles(), listPermissions()])
      .then(([r, p]) => {
        setRoles(r);
        setPermissions(p);
      })
      .catch((err) => setError(toApiError(err)));
  }

  useEffect(load, []);

  async function handleCreateRole(e) {
    e.preventDefault();
    setCreating(true);
    try {
      await createRole({ name: newRoleName.trim() });
      setNewRoleName("");
      showToast("Role created.", "success");
      load();
    } catch (err) {
      showToast(toApiError(err).message, "error");
    } finally {
      setCreating(false);
    }
  }

  function togglePermission(id) {
    setSelectedPermissionIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  async function handleAssign(e) {
    e.preventDefault();
    if (!selectedRoleId || selectedPermissionIds.length === 0) return;
    setAssigning(true);
    try {
      await assignPermissionsToRole(Number(selectedRoleId), selectedPermissionIds);
      showToast("Permissions assigned.", "success");
      setSelectedPermissionIds([]);
    } catch (err) {
      showToast(toApiError(err).message, "error");
    } finally {
      setAssigning(false);
    }
  }

  if (error) return <ErrorState message={error.message} onRetry={load} />;
  if (!roles) return <LoadingSpinner label="Loading roles…" />;

  return (
    <div>
      <AdminPageHeader title="Roles & Permissions" description="Define Staff roles and assign permissions to each." />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
        <div className={formStyles.formCard}>
          <h3 style={{ marginBottom: "1rem" }}>Roles</h3>
          <ul style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1.5rem" }}>
            {roles.map((r) => (
              <li key={r.roleId} style={{ fontSize: "0.9rem" }}>
                #{r.roleId} — {r.name}
              </li>
            ))}
          </ul>
          <form onSubmit={handleCreateRole} style={{ display: "flex", gap: "0.75rem" }}>
            <input type="text" className={formStyles.input} placeholder="New role name" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} required maxLength={100} />
            <Button type="submit" loading={creating}>
              Add
            </Button>
          </form>
        </div>

        <form className={formStyles.formCard} onSubmit={handleAssign}>
          <h3 style={{ marginBottom: "1rem" }}>Assign Permissions</h3>
          <FormField label="Role" required>
            <select className={formStyles.select} value={selectedRoleId} onChange={(e) => setSelectedRoleId(e.target.value)} required>
              <option value="" disabled>
                Select a role
              </option>
              {roles.map((r) => (
                <option key={r.roleId} value={r.roleId}>
                  {r.name}
                </option>
              ))}
            </select>
          </FormField>
          <p style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.5rem" }}>Permissions</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem", maxHeight: 220, overflowY: "auto" }}>
            {permissions.map((p) => (
              <label key={p.permissionId} className={formStyles.checkboxRow} style={{ fontSize: "0.85rem" }}>
                <input type="checkbox" checked={selectedPermissionIds.includes(p.permissionId)} onChange={() => togglePermission(p.permissionId)} />
                {p.name}
              </label>
            ))}
            {permissions.length === 0 ? <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>No permissions exist yet.</p> : null}
          </div>
          <Button type="submit" loading={assigning} disabled={!selectedRoleId || selectedPermissionIds.length === 0}>
            Assign Selected
          </Button>
        </form>
      </div>
    </div>
  );
}
