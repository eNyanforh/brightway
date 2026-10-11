import { useId } from "react";
import "./auth.css";

export default function AuthForm({
  title,
  description,
  onSubmit,
  busy,
  error,
  children,
  footer,
}) {
  const headingId = useId();

  return (
    <section
      className="auth-card"
      aria-labelledby={headingId}
    >
      <h1 id={headingId}>{title}</h1>

      <p className="auth-description">
        {description}
      </p>

      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      <form
        onSubmit={onSubmit}
        aria-busy={busy}
      >
        <fieldset disabled={busy}>
          {children}
        </fieldset>
      </form>

      <p className="auth-footer">{footer}</p>
    </section>
  );
}