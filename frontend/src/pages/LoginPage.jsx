import { useEffect, useRef, useState } from "react";

import {
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { authApi } from "../api/auth";
import { useAuth } from "../auth/useAuth";
import AuthForm from "../components/auth/AuthForm";
import PasswordField from "../components/auth/PasswordField";

export default function LoginPage() {
  const { login, verifyMfaLogin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState(
    location.state?.identifier || ""
  );

  const locked = useRef(false);
  const mfaInput = useRef(null);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (mfaRequired) mfaInput.current?.focus(); }, [mfaRequired]);

  async function cancelMfa() {
    if (locked.current) return; locked.current = true; setBusy(true); setError("");
    try { await authApi.cancelMfaLogin(); setMfaRequired(false); setCode(""); }
    catch (failure) { setError(failure.message); }
    finally { locked.current = false; setBusy(false); }
  }

  async function submit(event) {
    event.preventDefault();

    if (locked.current) return;
    locked.current = true;

    setError("");
    setBusy(true);

    try {
      const result = mfaRequired ? await verifyMfaLogin(code.trim()) : await login({ identifier: identifier.trim().toLowerCase(), password });
      if (result?.mfaRequired) { setMfaRequired(true); setPassword(""); setCode(""); return; }

      const requested = location.state?.from?.pathname;

      const destination = [
        "/profile",
        "/security",
        "/admin/credentials",
        "/explore",
        "/network",
        "/opportunities",
        "/learning",
      ].includes(requested)
        ? requested
        : "/explore";

      navigate(destination, { replace: true });
    } catch (failure) {
      setError(failure.message);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return (
    <AuthForm
      title={mfaRequired ? "Verify your sign-in" : "Log in to BrightWay"}
      description="Continue learning, connecting, and finding opportunities."
      onSubmit={submit}
      busy={busy}
      error={error}
      footer={
        <>
          New to BrightWay?{" "}
          <Link
            to="/register"
            state={{ from: location.state?.from }}
          >
            Create an account
          </Link>
        </>
      }
    >
      {location.state?.registered && (
        <p className="auth-notice" role="status">
          Your account is ready. Log in to continue.
        </p>
      )}

      {!mfaRequired && <>
      <div className="auth-field">
        <label htmlFor="login-identifier">
          Username or email
        </label>

        <input
          id="login-identifier"
          name="identifier"
          autoComplete="username"
          required
          maxLength={254}
          value={identifier}
          onChange={(event) =>
            setIdentifier(event.target.value)
          }
        />
      </div>

      <PasswordField id="login-password" name="password" label="Password"
        value={password} onChange={(event) => setPassword(event.target.value)}
        autoComplete="current-password" disabled={busy} />

      <Link to="/forgot-password">Forgot password?</Link>
      </>}
      {mfaRequired && <>
        <div className="auth-field"><label htmlFor="login-mfa-code">Authenticator or backup code</label><input ref={mfaInput} id="login-mfa-code" required autoComplete="one-time-code" autoCapitalize="off" spellCheck={false} minLength={6} maxLength={27} value={code} onChange={(event) => setCode(event.target.value)} /><small>Enter the current six-digit code from your authenticator app, or one unused backup code.</small></div>
        <button type="button" disabled={busy} onClick={() => void cancelMfa()}>Use another account</button>
      </>}

      <button
        className="auth-submit"
        type="submit"
        disabled={busy}
      >
        {busy ? "Checking…" : mfaRequired ? "Verify and log in" : "Log in"}
      </button>
    </AuthForm>
  );
}