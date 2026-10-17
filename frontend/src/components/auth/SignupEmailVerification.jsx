import { useEffect, useState } from "react";
import AuthForm from "./AuthForm";

export default function SignupEmailVerification({ email, code, setCode, busy, error, verified,
  expiresAt, retryAt, onSubmit, onResend, onBack }) {
  const [time, setTime] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const wait = Math.max(0, Math.ceil((retryAt - time) / 1000));
  const expired = expiresAt && new Date(expiresAt).getTime() <= time;
  return (
    <AuthForm title="Verify your email" description={`Verify ${email} using a six-digit email code.`}
      onSubmit={onSubmit} busy={busy} error={error}>
      <p>Your account will be created after your email is verified. Keep this tab open.</p>
      {!verified && <div className="auth-field">
        <label htmlFor="signup-email-code">Verification code</label>
        <input id="signup-email-code" name="code" type="text" inputMode="numeric"
          autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6}
          required disabled={busy} value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          aria-describedby="signup-code-hint" autoFocus />
        <small id="signup-code-hint">{expired ? "This code has expired. Request a new code." : "Codes expire after 10 minutes. Check your spam folder too."}</small>
      </div>}
      {verified && <p role="status">Email verified. You can finish creating your account.</p>}
      <button className="auth-submit" type="submit" disabled={busy || (!verified && !!expired)}>
        {busy ? "Please wait…" : verified ? "Create account" : "Verify email and create account"}
      </button>
      {!verified && <button type="button" className="signup-email-secondary" disabled={busy || wait > 0}
        onClick={onResend}>{wait > 0 ? `Resend code in ${wait}s` : "Resend code"}</button>}
      <button type="button" className="signup-email-secondary" disabled={busy} onClick={onBack}>
        Back to registration details
      </button>
    </AuthForm>
  );
}