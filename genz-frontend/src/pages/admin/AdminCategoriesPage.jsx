import { useEffect, useState } from "react";
import { listCategories, createCategory, updateCategory } from "../../api/categories";
import { toApiError } from "../../api/client";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useToast } from "../../context/ToastContext";
import AdminPageHeader from "../../components/admin/AdminPageHeader";
import AdminTable from "../../components/admin/AdminTable";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import ErrorState from "../../components/ui/ErrorState";
import FormField from "../../components/forms/FormField";
import formStyles from "../../components/forms/Form.module.css";

export default function AdminCategoriesPage() {
  useDocumentTitle("Manage Categories");
  const [state, setState] = useState({ categories: [], loading: true, error: null });
  const [editing, setEditing] = useState(null); // null = closed, {} = new, {categoryId,...} = edit
  const { showToast } = useToast();

  function load() {
    setState((s) => ({ ...s, loading: true, error: null }));
    listCategories()
      .then((categories) => setState({ categories, loading: false, error: null }))
      .catch((err) => setState({ categories: [], loading: false, error: toApiError(err) }));
  }

  useEffect(load, []);

  if (state.error) return <ErrorState message={state.error.message} onRetry={load} />;

  return (
    <div>
      <AdminPageHeader
        title="Categories"
        description="Product categories shown across the storefront."
        action={<Button onClick={() => setEditing({})}>+ New Category</Button>}
      />

      {state.loading ? (
        <LoadingSpinner label="Loading categories…" />
      ) : (
        <AdminTable
          rowKey="categoryId"
          rows={state.categories}
          columns={[
            { key: "name", label: "Name" },
            { key: "description", label: "Description", render: (c) => c.description || "—" },
            {
              key: "actions",
              label: "Actions",
              render: (c) => (
                <button type="button" onClick={() => setEditing(c)} style={{ fontWeight: 600, color: "var(--brand)" }}>
                  Edit
                </button>
              ),
            },
          ]}
        />
      )}

      <CategoryModal
        category={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
          showToast("Category saved.", "success");
        }}
      />
    </div>
  );
}

function CategoryModal({ category, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const isEdit = category && category.categoryId;

  useEffect(() => {
    setName(category?.name || "");
    setDescription(category?.description || "");
    setError(null);
  }, [category]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = { name: name.trim(), description: description.trim() || undefined };
      if (isEdit) {
        await updateCategory(category.categoryId, payload);
      } else {
        await createCategory(payload);
      }
      onSaved();
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={!!category} onClose={onClose} title={isEdit ? "Edit Category" : "New Category"}>
      <form onSubmit={handleSubmit}>
        <FormField label="Name" required>
          <input type="text" className={formStyles.input} value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
        </FormField>
        <FormField label="Description">
          <textarea className={formStyles.textarea} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
        </FormField>
        {error ? <p className={formStyles.error}>{error}</p> : null}
        <div className={formStyles.formActions}>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
