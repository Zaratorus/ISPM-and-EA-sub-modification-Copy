import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset, resetCustomerPassword, verifyPasswordResetOtp } from "../api/customerAuth";
import { toApiError } from "../api/client";
import { useToast } from "../context/ToastContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import Button from "../components/ui/Button";
import FormField from "../components/forms/FormField";
import formStyles from "../components/forms/Form.module.css";
import authStyles from "./AuthPage.module.css";
import styles from "./ForgotPasswordPage.module.css";

/**
 * Customer forgot-password flow on a single route:
 *   email -> 6-digit code -> new password -> done.
 *
 * The email, code and passwords live only in this component's state — never
 * in the URL, router history state, localStorage, sessionStorage or cookies —
 * so a refresh deliberately restarts the flow. The backend is authoritative
 * for every rule; the checks here are only for immediate feedback.
 */

const INVALID_CODE = "INVALID_OR_EXPIRED_CODE";
const INVALID_CODE_MESSAGE = "Invalid or expired verification code. Please request a new code.";
const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

// Display only: mirrors the backend's 60-second resend cooldown so the button
// is not offered when a new code would not be sent anyway.
const RESEND_COOLDOWN_SECONDS = 60;

// Lightweight mirror of the backend password rules (newPasswordSchema).
const PASSWORD_RULES = [
  { id: "length", label: "At least 9 characters", test: (v) => [...v].length >= 9 },
  { id: "letter", label: "At least one letter", test: (v) => /\p{L}/u.test(v) },
  { id: "number", label: "At least one number", test: (v) => /\p{N}/u.test(v) },
  { id: "special", label: "At least one special character (e.g. ! @ #)", test: (v) => /[^\p{L}\p{N}\s]/u.test(v) },
];
const PASSWORD_MAX_BYTES = 72;

function passwordProblem(value) {
  if (value !== "" && value.trim() === "") return "Password cannot contain only whitespace.";
  if (new TextEncoder().encode(value).length > PASSWORD_MAX_BYTES) {
    return "Password is too long (maximum 72 characters; some symbols count as more than one).";
  }
  return null;
}

// User-facing text for an API error. Never shows server internals.
function friendlyError(apiError) {
  if (apiError.code === INVALID_CODE) return INVALID_CODE_MESSAGE;
  if (apiError.code === "VALIDATION_ERROR") {
    // Backend format: "field: message; field: message" — keep the messages only.
    return apiError.message
      .split("; ")
      .map((part) => part.replace(/^[\w.]+: /, ""))
      .join(" ");
  }
  if (apiError.code === "NETWORK_ERROR") return apiError.message;
  return GENERIC_ERROR_MESSAGE;
}

export default function ForgotPasswordPage() {
  useDocumentTitle("Forgot Password");
  const { showToast } = useToast();

  const [step, setStep] = useState("email"); // email | otp | password | done
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);
  const [codeRejected, setCodeRejected] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!cooldownUntil) return undefined;
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

  function goTo(nextStep) {
    setError(null);
    setCodeRejected(false);
    setStep(nextStep);
  }

  function clearSecrets() {
    setOtp("");
    setNewPassword("");
    setConfirmPassword("");
  }

  function startOver() {
    clearSecrets();
    setNotice(null);
    goTo("email");
  }

  // Same generic answer for every address (the backend never says whether an
  // account exists), so it is shown as-is.
  async function requestCode() {
    const result = await requestPasswordReset(email);
    setNotice(result.message);
    setCooldownUntil(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
    setSecondsLeft(RESEND_COOLDOWN_SECONDS);
    clearSecrets();
    return result;
  }

  async function handleEmailSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await requestCode();
      goTo("otp");
    } catch (err) {
      setError(friendlyError(toApiError(err)));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError(null);
    try {
      const result = await requestCode();
      goTo("otp");
      showToast(`${result.message} Only the most recent code will work.`, "info", 6000);
    } catch (err) {
      setError(friendlyError(toApiError(err)));
    } finally {
      setResending(false);
    }
  }

  function handleCodeError(err) {
    const apiError = toApiError(err);
    setError(friendlyError(apiError));
    if (apiError.code === INVALID_CODE) {
      setOtp("");
      setCodeRejected(true);
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    if (!/^[0-9]{6}$/.test(otp)) {
      setError("Enter the 6-digit code from the email.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setCodeRejected(false);
    try {
      const result = await verifyPasswordResetOtp({ email, otp });
      if (result?.verified === true) {
        goTo("password");
      } else {
        setError(INVALID_CODE_MESSAGE);
      }
    } catch (err) {
      handleCodeError(err);
    } finally {
      setSubmitting(false);
    }
  }

  const ruleResults = PASSWORD_RULES.map((rule) => ({ ...rule, met: rule.test(newPassword) }));
  const newPasswordProblem = passwordProblem(newPassword);
  const passwordValid = ruleResults.every((rule) => rule.met) && !newPasswordProblem;
  const confirmMismatch = confirmPassword !== "" && confirmPassword !== newPassword;

  async function handleReset(e) {
    e.preventDefault();
    if (!passwordValid) {
      setError("Choose a password that meets all the requirements above.");
      return;
    }
    // The Confirm Password field already shows "Passwords do not match."
    if (newPassword !== confirmPassword) {
      setError(null);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await resetCustomerPassword({ email, otp, newPassword, confirmPassword });
      clearSecrets();
      setNotice(null);
      goTo("done");
    } catch (err) {
      handleCodeError(err);
    } finally {
      setSubmitting(false);
    }
  }

  const resendControl = (
    <button
      type="button"
      className={styles.linkButton}
      onClick={handleResend}
      disabled={resending || secondsLeft > 0}
    >
      {resending ? "Sending…" : secondsLeft > 0 ? `Resend OTP (${secondsLeft}s)` : "Resend OTP"}
    </button>
  );

  const errorMessage = error ? (
    <p className={`${formStyles.error} ${styles.formError}`} role="alert">
      {error}
    </p>
  ) : null;

  const backToLogin = (
    <p className={authStyles.switchLink}>
      <Link to="/login">Back to Login</Link>
    </p>
  );

  return (
    <div className={`${authStyles.page} container`}>
      <div className={authStyles.card}>
        {step === "email" ? (
          <>
            <p className={styles.step}>Step 1 of 3</p>
            <h1>Forgot Password?</h1>
            <p className={authStyles.subtitle}>Enter your email address and we&apos;ll send you a verification code.</p>

            <form onSubmit={handleEmailSubmit}>
              <FormField label="Email Address" required>
                {(id) => (
                  <input
                    id={id}
                    type="email"
                    className={formStyles.input}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    maxLength={255}
                    required
                  />
                )}
              </FormField>

              {errorMessage}

              <Button type="submit" variant="primary" size="lg" loading={submitting} className={authStyles.submit}>
                Send OTP
              </Button>
            </form>

            {backToLogin}
          </>
        ) : null}

        {step === "otp" ? (
          <>
            <p className={styles.step}>Step 2 of 3</p>
            <h1>Verify OTP</h1>
            <p className={authStyles.subtitle}>Enter the 6-digit verification code sent to your email.</p>

            {notice ? (
              <p className={styles.notice}>
                {notice} The code is valid for 10 minutes.
              </p>
            ) : null}

            <form onSubmit={handleVerify}>
              <FormField label="6-digit OTP" required>
                {(id) => (
                  <input
                    id={id}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className={`${formStyles.input} ${styles.otpInput}`}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                    maxLength={6}
                    required
                  />
                )}
              </FormField>

              {errorMessage}

              <Button type="submit" variant="primary" size="lg" loading={submitting} className={authStyles.submit}>
                Verify Code
              </Button>
            </form>

            <div className={styles.secondaryActions}>
              <span>Didn&apos;t get a code? {resendControl}</span>
              <button type="button" className={styles.linkButton} onClick={startOver}>
                Use a different email
              </button>
            </div>

            {backToLogin}
          </>
        ) : null}

        {step === "password" ? (
          <>
            <p className={styles.step}>Step 3 of 3</p>
            <h1>Create a New Password</h1>
            <p className={authStyles.subtitle}>Choose a new password for your Gen-Z account.</p>

            <form onSubmit={handleReset}>
              <FormField label="New Password" required error={newPassword ? newPasswordProblem : null}>
                {(id) => (
                  <>
                    <input
                      id={id}
                      type="password"
                      className={formStyles.input}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      aria-describedby={`${id}-rules`}
                      required
                    />
                    <ul id={`${id}-rules`} className={styles.rules} aria-label="Password must contain">
                      {ruleResults.map((rule) => (
                        <li key={rule.id} className={rule.met ? `${styles.rule} ${styles.ruleMet}` : styles.rule}>
                          {rule.label}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </FormField>

              <FormField label="Confirm Password" required error={confirmMismatch ? "Passwords do not match." : null}>
                {(id) => (
                  <input
                    id={id}
                    type="password"
                    className={`${formStyles.input} ${confirmMismatch ? formStyles.inputError : ""}`}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                )}
              </FormField>

              {errorMessage}
              {codeRejected ? (
                <div className={`${styles.secondaryActions} ${styles.inlineActions}`}>
                  <span>Need a new code? {resendControl}</span>
                </div>
              ) : null}

              <Button type="submit" variant="primary" size="lg" loading={submitting} className={authStyles.submit}>
                Reset Password
              </Button>
            </form>

            <div className={styles.secondaryActions}>
              <button type="button" className={styles.linkButton} onClick={startOver}>
                Start over
              </button>
            </div>

            {backToLogin}
          </>
        ) : null}

        {step === "done" ? (
          <div className={styles.success}>
            <div className={styles.successIcon} aria-hidden="true">
              ✓
            </div>
            <h1>Password Updated Successfully</h1>
            <p className={authStyles.subtitle}>Your password has been changed. Please log in with your new password.</p>
            <Button to="/login" variant="primary" size="lg" className={authStyles.submit}>
              Back to Login
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
