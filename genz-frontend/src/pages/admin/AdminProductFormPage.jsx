import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getProduct, createProduct, updateProduct, addProductImage } from "../../api/products";
import { useCategories } from "../../hooks/useCategories";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useToast } from "../../context/ToastContext";
import { toApiError } from "../../api/client";
import AdminPageHeader from "../../components/admin/AdminPageHeader";
import Button from "../../components/ui/Button";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import FormField from "../../components/forms/FormField";
import formStyles from "../../components/forms/Form.module.css";

export default function AdminProductFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  useDocumentTitle(isEdit ? "Edit Product" : "New Product");
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { categories } = useCategories();

  const [form, setForm] = useState({ categoryId: "", name: "", description: "", price: "" });
  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [imageReference, setImageReference] = useState("");
  const [addingImage, setAddingImage] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    getProduct(id)
      .then((p) =>
        setForm({
          categoryId: p.category_id,
          name: p.name,
          description: p.description || "",
          price: p.price,
        })
      )
      .catch((err) => setError(toApiError(err).message))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const payload = {
      categoryId: Number(form.categoryId),
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      price: Number(form.price),
    };
    try {
      if (isEdit) {
        await updateProduct(id, payload);
        showToast("Product updated.", "success");
      } else {
        const created = await createProduct(payload);
        showToast("Product created.", "success");
        navigate(`/admin/products/${created.product_id}/edit`, { replace: true });
        return;
      }
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddImage(e) {
    e.preventDefault();
    if (!imageReference.trim()) return;
    setAddingImage(true);
    try {
      await addProductImage(id, { imageReference: imageReference.trim() });
      setImageReference("");
      showToast("Image added.", "success");
    } catch (err) {
      showToast(toApiError(err).message, "error");
    } finally {
      setAddingImage(false);
    }
  }

  if (loading) return <LoadingSpinner label="Loading product…" />;

  return (
    <div>
      <AdminPageHeader title={isEdit ? "Edit Product" : "New Product"} />

      <form className={formStyles.formCard} onSubmit={handleSubmit} style={{ maxWidth: 560 }}>
        <FormField label="Category" required>
          <select
            className={formStyles.select}
            value={form.categoryId}
            onChange={(e) => update("categoryId", e.target.value)}
            required
          >
            <option value="" disabled>
              Select a category
            </option>
            {categories.map((c) => (
              <option key={c.categoryId} value={c.categoryId}>
                {c.name}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Name" required>
          <input
            type="text"
            className={formStyles.input}
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            required
            maxLength={150}
          />
        </FormField>

        <FormField label="Description">
          <textarea
            className={formStyles.textarea}
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            maxLength={5000}
          />
        </FormField>

        <FormField label="Price (LKR)" required>
          <input
            type="number"
            min="0.01"
            step="0.01"
            className={formStyles.input}
            value={form.price}
            onChange={(e) => update("price", e.target.value)}
            required
          />
        </FormField>

        {error ? <p className={formStyles.error}>{error}</p> : null}

        <div className={formStyles.formActions}>
          <Button type="submit" variant="primary" loading={submitting}>
            {isEdit ? "Save Changes" : "Create Product"}
          </Button>
        </div>
      </form>

      {isEdit ? (
        <div className={formStyles.formCard} style={{ maxWidth: 560, marginTop: "1.5rem" }}>
          <h3 style={{ marginBottom: "0.75rem" }}>Product Images</h3>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1rem" }}>
            Enter the Cloudflare R2 object key (or a full image URL) for this product.
          </p>
          <form onSubmit={handleAddImage} style={{ display: "flex", gap: "0.75rem" }}>
            <input
              type="text"
              className={formStyles.input}
              placeholder="products/shirt-navy.jpg"
              value={imageReference}
              onChange={(e) => setImageReference(e.target.value)}
            />
            <Button type="submit" variant="dark" loading={addingImage}>
              Add
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
