import { useEffect, useState } from "react";
import { listActivityLog } from "../../api/activityLog";
import { toApiError } from "../../api/client";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import AdminPageHeader from "../../components/admin/AdminPageHeader";
import AdminTable from "../../components/admin/AdminTable";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import ErrorState from "../../components/ui/ErrorState";
import EmptyState from "../../components/ui/EmptyState";
import { formatDateTime } from "../../utils/format";
import formStyles from "../../components/forms/Form.module.css";

const MODULES = ["", "A", "B", "C", "D"];

export default function AdminActivityLogPage() {
  useDocumentTitle("Activity Log");
  const [originatingModule, setOriginatingModule] = useState("");
  const [state, setState] = useState({ entries: [], loading: true, error: null });

  function load() {
    setState((s) => ({ ...s, loading: true, error: null }));
    listActivityLog({ page: 1, limit: 100, originatingModule: originatingModule || undefined })
      .then((res) => setState({ entries: res.data, loading: false, error: null }))
      .catch((err) => setState({ entries: [], loading: false, error: toApiError(err) }));
  }

  useEffect(load, [originatingModule]);

  return (
    <div>
      <AdminPageHeader title="Activity Log" description="The single, central audit trail across every module." />

      <div style={{ marginBottom: "1.5rem", maxWidth: 220 }}>
        <select className={formStyles.select} value={originatingModule} onChange={(e) => setOriginatingModule(e.target.value)}>
          <option value="">All modules</option>
          {MODULES.filter(Boolean).map((m) => (
            <option key={m} value={m}>
              Module {m}
            </option>
          ))}
        </select>
      </div>

      {state.loading ? (
        <LoadingSpinner label="Loading activity…" />
      ) : state.error ? (
        <ErrorState message={state.error.message} onRetry={load} />
      ) : state.entries.length === 0 ? (
        <EmptyState title="No activity yet" message="Actions across the store will appear here." />
      ) : (
        <AdminTable
          rowKey="activityLogId"
          rows={state.entries}
          columns={[
            { key: "timestamp", label: "When", render: (e) => formatDateTime(e.timestamp) },
            { key: "originatingModule", label: "Module" },
            { key: "actionType", label: "Action" },
            { key: "affectedEntityType", label: "Entity", render: (e) => `${e.affectedEntityType} #${e.affectedEntityId}` },
            { key: "actorType", label: "Actor", render: (e) => (e.actorType === "OWNER_ADMIN" ? "Owner/Admin" : e.actorType === "STAFF_ADMIN_USER" ? `Staff #${e.actorId}` : e.actorType) },
          ]}
        />
      )}
    </div>
  );
}
