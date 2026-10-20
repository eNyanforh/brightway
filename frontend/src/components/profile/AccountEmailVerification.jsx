import { useEffect, useId, useRef, useState } from "react";
import { profileApi } from "../../api/profile";

export default function AccountEmailVerification({ email, busy, onBusy, onVerified, onClose }) {
  const id = useId();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [time, setTime] = useState(() => Date.now());
  const pending = useRef(null);
  useEffect(() => {
    const timer = setInterval(() => setTime(Date.now()), 1000);
    return () => { clearInterval(timer); pending.current?.abort(); };
  }, []);
  const wait = Math.max(0, Math.ceil((retryAt - time) / 1000));
  async function perform(action) {
    if (busy || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setError(""); onBusy(true);
    try {
      const result = action === "send"
        ? await profileApi.requestEmail(controller.signal)
        : await profileApi.verifyEmail(code, controller.signal);
      if (controller.signal.aborted) return;
      if (result.verified) await onVerified(result);
      else {
        setSent(true); setCode("");
        setRetryAt(Date.now() + result.retryAfterSeconds * 1000);
      }
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure.message);
        if (action === "send") setRetryAt(Date.now() + 60000);
      }
    } finally {
      pending.current = null;
      onBusy(false);
    }
  }
  return <div className="bw-account-email">
    <h3>Verify your email</h3>
    <p>We will send a code to <strong>{email}</strong>. Your email address stays unchanged.</p>
    {error && <p role="alert" className="bw-profile-error">{error}</p>}
    {sent && <p role="status">Code sent. Check your inbox and spam folder. It expires after 10 minutes.</p>}
    <button type="button" className="bw-profile-button bw-profile-button-secondary"
      disabled={busy || wait > 0} onClick={() => perform("send")}>
      {wait ? `Resend code in ${wait}s` : sent ? "Resend code" : "Send verification code"}
    </button>
    <form onSubmit={(event) => {
      event.preventDefault();
      if (!/^\d{6}$/.test(code)) { setError("Enter the six-digit code from your email."); return; }
      void perform("verify");
    }}>
      <div className="bw-profile-field">
        <label htmlFor={`${id}-code`}>Email verification code</label>
        <input id={`${id}-code`} type="text" inputMode="numeric" autoComplete="one-time-code"
          required pattern="[0-9]{6}" maxLength={6} minLength={6} disabled={busy}
          value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          aria-describedby={`${id}-hint`} />
        <small id={`${id}-hint`}>Request a code, or enter one you already received for this account.</small>
      </div>
      <div className="bw-completion-actions">
        <button className="bw-profile-button" type="submit" disabled={busy}>{busy ? "Please wait…" : "Verify email"}</button>
        <button className="bw-profile-text-button" type="button" disabled={busy} onClick={onClose}>Close email verification</button>
      </div>
    </form>
  </div>;
}