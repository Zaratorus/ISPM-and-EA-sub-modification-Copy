import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { searchProducts, discontinueProduct, adjustStock } from "../../api/products";
import { toApiError } from "../../api/client";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useToast } from "../../context/ToastContext";
import AdminPageHeader from "../../components/admin/AdminPageHeader";
import AdminTable from "../../components/admin/AdminTable";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import ErrorState from "../../components/ui/ErrorState";
import FormField from "../../components/forms/FormField";
import formStyles from "../../components/forms/Form.module.css";
import { formatCurrency } from "../../utils/format";

export default function AdminProductsPage() {
  useDocumentTitle("Manage Products");
  const { showToast } = useToast();
  const [state, setState] = useState({ products: [], loading: true, error: null });
  const [stockModalProduct, setStockModalProduct] = useState(null);

  function load() {
    setState((s) => ({ ...s, loading: true, error: null }));
    searchProducts({ page: 1, limit: 100 })
      .then((res) => setState({ products: res.data, loading: false, error: null }))
      .catch((err) => setState({ products: [], loading: false, error: toApiError(err) }));
  }

  useEffect(load, []);

  async function handleDiscontinue(product) {
    if (!window.confirm(`Discontinue "${product.name}"? It will stay visible to admins but hidden from the storefront.`)) {
      return;
    }
    try {
      await discontinueProduct(product.product_id);
      showToast("Product discontinued.", "success");
      load();
    } catch (err) {
      showToast(toApiError(err).message, "error");
    }
  }

  if (state.error) return <ErrorState message={state.error.message} onRetry={load} />;

  return (
    <div>
      <AdminPageHeader
        title="Products"
        description="Create, edit, discontinue, and adjust stock for the product catalogue."
        action={<Button to="/admin/products/new">+ New Product</Button>}
      />

      {state.loading ? (
        <LoadingSpinner label="Loading products…" />
      ) : (
        <AdminTable
          rowKey="product_id"
          rows={state.products}
          columns={[
            { key: "name", label: "Name" },
            { key: "category_id", label: "Category ID" },
            { key: "price", label: "Price", render: (p) => formatCurrency(p.price) },
            { key: "stock_quantity", label: "Stock", render: (p) => p.stock_quantity ?? "—" },
            {
              key: "status",
              label: "Status",
              render: (p) => <Badge tone={p.status === "ACTIVE" ? "success" : "neutral"}>{p.status}</Badge>,
            },
            {
              key: "actions",
              label: "Actions",
              render: (p) => (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <Link to={`/admin/products/${p.product_id}/edit`} style={{ fontWeight: 600, color: "var(--brand)" }}>
                    Edit
                  </Link>
                  <button type="button" onClick={() => setStockModalProduct(p)} style={{ fontWeight: 600, color: "var(--text-secondary)" }}>
                    Adjust Stock
                  </button>
                  {p.status === "ACTIVE" ? (
                    <button type="button" onClick={() => handleDiscontinue(p)} style={{ fontWeight: 600, color: "var(--color-error)" }}>
                      Discontinue
                    </button>
                  ) : null}
                </div>
              ),
            },
          ]}
        />
      )}

      <StockAdjustModal
        product={stockModalProduct}
        onClose={() => setStockModalProduct(null)}
        onSaved={() => {
          setStockModalProduct(null);
          load();
        }}
      />
    </div>
  );
}

function StockAdjustModal({ product, onClose, onSaved }) {
  const [newQuantity, setNewQuantity] = useState(0);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (product) {
      setNewQuantity(product.stock_quantity ?? 0);
      setReason("");
      setError(null);
    }
  }, [product]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await adjustStock(product.product_id, { newQuantity: Number(newQuantity), reason: reason.trim() });
      showToast("Stock updated.", "success");
      onSaved();
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={!!product} onClose={onClose} title={`Adjust Stock — ${product?.name || ""}`}>
      <form onSubmit={handleSubmit}>
        <FormField label="New Quantity" required>
          <input
            type="number"
            min="0"
            className={formStyles.input}
            value={newQuantity}
            onChange={(e) => setNewQuantity(e.target.value)}
            required
          />
        </FormField>
        <FormField label="Reason" required hint="Required for every manual correction (audit trail).">
          <input
            type="text"
            className={formStyles.input}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            maxLength={500}
          />
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
