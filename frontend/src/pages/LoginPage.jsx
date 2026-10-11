import { useState } from "react";

import {
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { useAuth } from "../auth/useAuth";
import AuthForm from "../components/auth/AuthForm";

export default function LoginPage() {
  const { login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState(
    location.state?.identifier || ""
  );

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();

    if (busy) return;

    setError("");
    setBusy(true);

    try {
      await login({
        identifier: identifier.trim().toLowerCase(),
        password,
      });

      const requested = location.state?.from?.pathname;

      const destination = [
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
      setBusy(false);
    }
  }

  return (
    <AuthForm
      title="Log in to BrightWay"
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

      <div className="auth-field">
        <label htmlFor="login-password">
          Password
        </label>

        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          value={password}
          onChange={(event) =>
            setPassword(event.target.value)
          }
        />
      </div>

      <button
        className="auth-submit"
        type="submit"
        disabled={busy}
      >
        {busy ? "Logging in…" : "Log in"}
      </button>
    </AuthForm>
  );
}