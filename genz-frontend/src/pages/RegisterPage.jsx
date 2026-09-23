import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCustomerAuth } from "../context/CustomerAuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import Button from "../components/ui/Button";
import FormField from "../components/forms/FormField";
import formStyles from "../components/forms/Form.module.css";
import authStyles from "./AuthPage.module.css";

export default function RegisterPage() {
  useDocumentTitle("Create Account");
  const { register } = useCustomerAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", contactInfo: "", password: "" });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await register(form);
    setSubmitting(false);
    if (result.ok) {
      navigate("/account", { replace: true });
    } else {
      setError(result.error.message);
    }
  }

  return (
    <div className={`${authStyles.page} container`}>
      <div className={authStyles.card}>
        <h1>Create Your Account</h1>
        <p className={authStyles.subtitle}>Join Gen-Z for a faster checkout and order tracking.</p>

        <form onSubmit={handleSubmit}>
          <FormField label="Full Name" required>
            <input
              type="text"
              className={formStyles.input}
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              autoComplete="name"
              required
              maxLength={150}
            />
          </FormField>

          <FormField
            label="Email or Phone"
            required
            hint="An email address or phone number such as +94 77 123 4567. Used to log in — must be unique."
          >
            <input
              type="text"
              className={formStyles.input}
              value={form.contactInfo}
              onChange={(e) => update("contactInfo", e.target.value)}
              autoComplete="email"
              required
              maxLength={255}
            />
          </FormField>

          <FormField
            label="Password"
            required
            hint="9–72 characters, with at least one letter, one number and one special character (e.g. ! @ #)."
          >
            <input
              type="password"
              className={formStyles.input}
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              autoComplete="new-password"
              required
              minLength={9}
              maxLength={72}
            />
          </FormField>

          {error ? <p className={formStyles.error}>{error}</p> : null}

          <Button type="submit" variant="primary" size="lg" loading={submitting} className={authStyles.submit}>
            Create Account
          </Button>
        </form>

        <p className={authStyles.switchLink}>
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
