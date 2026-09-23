import { useEffect, useState } from "react";
import { getFullSettings, updateSettings } from "../../api/settings";
import { toApiError } from "../../api/client";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useToast } from "../../context/ToastContext";
import AdminPageHeader from "../../components/admin/AdminPageHeader";
import Button from "../../components/ui/Button";
import FormField from "../../components/forms/FormField";
import formStyles from "../../components/forms/Form.module.css";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import ErrorState from "../../components/ui/ErrorState";

export default function AdminSettingsPage() {
  useDocumentTitle("Store Settings");
  const { showToast } = useToast();
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function load() {
    setForm(null);
    setError(null);
    setNotConfigured(false);
    getFullSettings()
      .then((s) => setForm({ storeName: s.storeName, contactInfo: s.contactInfo, whatsappNumber: s.whatsappNumber }))
      .catch((err) => {
        const apiError = toApiError(err);
        if (apiError.code === "SETTINGS_NOT_CONFIGURED") {
          setNotConfigured(true);
          setForm({ storeName: "", contactInfo: "", whatsappNumber: "" });
        } else {
          setError(apiError);
        }
      });
  }

  useEffect(load, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await updateSettings(form);
      showToast("Store settings saved.", "success");
      setNotConfigured(false);
    } catch (err) {
      showToast(toApiError(err).message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (error) return <ErrorState message={error.message} onRetry={load} />;
  if (!form) return <LoadingSpinner label="Loading settings…" />;

  return (
    <div>
      <AdminPageHeader title="Store Settings" description="Store name, contact info, and the WhatsApp number used at checkout." />

      {notConfigured ? <p style={{ marginBottom: "1rem", color: "var(--color-warning)" }}>No settings configured yet — set them below.</p> : null}

      <form className={formStyles.formCard} onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
        <FormField label="Store Name" required>
          <input type="text" className={formStyles.input} value={form.storeName} onChange={(e) => setForm((f) => ({ ...f, storeName: e.target.value }))} required maxLength={150} />
        </FormField>
        <FormField label="Contact Info" required>
          <input type="text" className={formStyles.input} value={form.contactInfo} onChange={(e) => setForm((f) => ({ ...f, contactInfo: e.target.value }))} required maxLength={255} />
        </FormField>
        <FormField label="WhatsApp Number" required hint="Used to build the checkout wa.me link.">
          <input type="text" className={formStyles.input} value={form.whatsappNumber} onChange={(e) => setForm((f) => ({ ...f, whatsappNumber: e.target.value }))} required maxLength={30} />
        </FormField>
        <Button type="submit" variant="primary" loading={submitting}>
          Save Settings
        </Button>
      </form>
    </div>
  );
}
