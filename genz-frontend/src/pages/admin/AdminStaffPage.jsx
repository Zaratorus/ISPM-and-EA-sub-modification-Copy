import { useEffect, useState } from "react";
import { listStaff, createStaff, deactivateStaff } from "../../api/staff";
import { listRoles } from "../../api/roles";
import { toApiError } from "../../api/client";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useToast } from "../../context/ToastContext";
import AdminPageHeader from "../../components/admin/AdminPageHeader";
import AdminTable from "../../components/admin/AdminTable";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import ErrorState from "../../components/ui/ErrorState";
import FormField from "../../components/forms/FormField";
import formStyles from "../../components/forms/Form.module.css";

// Staff accounts can be created here (Owner-Access-Key only), but no
// Staff login mechanism exists yet — Backend/API Architecture Design
// V1.0, Section 15 item 1, an OPEN decision this frontend does not
// resolve or work around.
export default function AdminStaffPage() {
  useDocumentTitle("Staff");
  const { showToast } = useToast();
  const [state, setState] = useState({ staff: [], loading: true, error: null });
  const [roles, setRoles] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);

  function load() {
    setState((s) => ({ ...s, loading: true, error: null }));
    listStaff()
      .then((staff) => setState({ staff, loading: false, error: null }))
      .catch((err) => setState({ staff: [], loading: false, error: toApiError(err) }));
    listRoles().then(setRoles).catch(() => {});
  }

  useEffect(load, []);

  async function handleDeactivate(member) {
    if (!window.confirm(`Deactivate "${member.name}"?`)) return;
    try {
      await deactivateStaff(member.staffAdminUserId);
      showToast("Staff account deactivated.", "success");
      load();
    } catch (err) {
      showToast(toApiError(err).message, "error");
    }
  }

  if (state.error) return <ErrorState message={state.error.message} onRetry={load} />;

  return (
    <div>
      <AdminPageHeader
        title="Staff"
        description="Staff/Admin User accounts. Staff login is not yet available (OPEN decision)."
        action={<Button onClick={() => setCreateOpen(true)}>+ New Staff Account</Button>}
      />

      {state.loading ? (
        <LoadingSpinner label="Loading staff…" />
      ) : (
        <AdminTable
          rowKey="staffAdminUserId"
          rows={state.staff}
          columns={[
            { key: "name", label: "Name" },
            { key: "roleId", label: "Role ID" },
            { key: "status", label: "Status", render: (s) => <Badge tone={s.status === "ACTIVE" ? "success" : "neutral"}>{s.status}</Badge> },
            {
              key: "actions",
              label: "Actions",
              render: (s) =>
                s.status === "ACTIVE" ? (
                  <button type="button" onClick={() => handleDeactivate(s)} style={{ fontWeight: 600, color: "var(--color-error)" }}>
                    Deactivate
                  </button>
                ) : (
                  "—"
                ),
            },
          ]}
        />
      )}

      <CreateStaffModal open={createOpen} roles={roles} onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); load(); }} />
    </div>
  );
}

function CreateStaffModal({ open, roles, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setRoleId("");
      setError(null);
    }
  }, [open]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createStaff({ name: name.trim(), roleId: Number(roleId) });
      onSaved();
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Staff Account">
      <form onSubmit={handleSubmit}>
        <FormField label="Name" required>
          <input type="text" className={formStyles.input} value={name} onChange={(e) => setName(e.target.value)} required maxLength={150} />
        </FormField>
        <FormField label="Role" required>
          <select className={formStyles.select} value={roleId} onChange={(e) => setRoleId(e.target.value)} required>
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
        {error ? <p className={formStyles.error}>{error}</p> : null}
        <div className={formStyles.formActions}>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={submitting}>Create</Button>
        </div>
      </form>
    </Modal>
  );
}
