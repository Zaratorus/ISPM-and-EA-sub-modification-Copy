import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useCustomerAuth } from "../context/CustomerAuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import Button from "../components/ui/Button";
import FormField from "../components/forms/FormField";
import formStyles from "../components/forms/Form.module.css";
import authStyles from "./AuthPage.module.css";

export default function LoginPage() {
  useDocumentTitle("Log In");
  const { login } = useCustomerAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [contactInfo, setContactInfo] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await login({ contactInfo, password });
    setSubmitting(false);
    if (result.ok) {
      const redirectTo = location.state?.from?.pathname || "/account";
      navigate(redirectTo, { replace: true });
    } else {
      setError(result.error.message);
    }
  }

  return (
    <div className={`${authStyles.page} container`}>
      <div className={authStyles.card}>
        <h1>Welcome Back</h1>
        <p className={authStyles.subtitle}>Log in to view your cart, orders and reviews.</p>

        <form onSubmit={handleSubmit}>
          <FormField label="Email or Phone" required>
            <input
              type="text"
              className={formStyles.input}
              value={contactInfo}
              onChange={(e) => setContactInfo(e.target.value)}
              autoComplete="username"
              required
            />
          </FormField>

          <FormField label="Password" required>
            <input
              type="password"
              className={formStyles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </FormField>

          <div className={authStyles.forgotRow}>
            <Link to="/forgot-password">Forgot Password?</Link>
          </div>

          {error ? <p className={formStyles.error}>{error}</p> : null}

          <Button type="submit" variant="primary" size="lg" loading={submitting} className={authStyles.submit}>
            Log In
          </Button>
        </form>

        <p className={authStyles.switchLink}>
          New to Gen-Z? <Link to="/register">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
