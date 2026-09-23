import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import Button from "../../components/ui/Button";
import FormField from "../../components/forms/FormField";
import formStyles from "../../components/forms/Form.module.css";
import authStyles from "../AuthPage.module.css";

export default function AdminLoginPage() {
  useDocumentTitle("Store Admin Login");
  const { isAdmin, login } = useAdminAuth();
  const navigate = useNavigate();
  const [accessKey, setAccessKey] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (isAdmin) return <Navigate to="/admin" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await login(accessKey);
    setSubmitting(false);
    if (result.ok) {
      navigate("/admin", { replace: true });
    } else {
      setError(result.error.message);
    }
  }

  return (
    <div className={`${authStyles.page} container`} style={{ minHeight: "100vh" }}>
      <div className={authStyles.card}>
        <h1>Store Admin</h1>
        <p className={authStyles.subtitle}>Enter the Owner/Admin Access Key to continue.</p>

        <form onSubmit={handleSubmit}>
          <FormField label="Access Key" required>
            <input
              type="password"
              className={formStyles.input}
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
              autoComplete="off"
              autoFocus
              required
            />
          </FormField>

          {error ? <p className={formStyles.error}>{error}</p> : null}

          <Button type="submit" variant="dark" size="lg" loading={submitting} className={authStyles.submit}>
            Enter Admin Area
          </Button>
        </form>
      </div>
    </div>
  );
}
