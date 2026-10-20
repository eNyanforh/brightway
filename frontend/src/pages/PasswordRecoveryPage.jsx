import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { authApi } from "../api/auth";
import AuthForm from "../components/auth/AuthForm";
import PasswordField from "../components/auth/PasswordField";
export default function PasswordRecoveryPage() {
  const [step, setStep] = useState("request"), [email, setEmail] = useState("");
  const [code, setCode] = useState(""), [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(""), [cooldown, setCooldown] = useState(0);
  const lock = useRef(false), heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, [step]);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  async function request() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await authApi.requestPasswordReset(email.trim().toLowerCase());
      setNotice(result.message); setStep("confirm"); setCooldown(60); setCode("");
    } catch (failure) { setError(failure.message); }
    finally { lock.current = false; setBusy(false); }
  }
  async function submit(event) {
    event.preventDefault();
    if (lock.current || step === "done") return;
    if (step === "request") { await request(); return; }
    if (password !== confirmation) { setError("Passwords do not match."); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await authApi.confirmPasswordReset({ email: email.trim().toLowerCase(), code, password });
      setNotice(result.message); setPassword(""); setConfirmation(""); setCode(""); setStep("done");
    } catch (failure) { setError(failure.message); }
    finally { lock.current = false; setBusy(false); }
  }
  return <AuthForm title={step === "done" ? "Password reset" : "Reset your password"} description="Use your account email to recover access to BrightWay." onSubmit={submit} busy={busy} error={error} footer={<Link to="/login">Back to login</Link>}>
    <h2 ref={heading} tabIndex={-1}>{step === "request" ? "Your email" : step === "confirm" ? "Code and new password" : "Your password has changed"}</h2>
    {notice && <p role="status" className="auth-notice">{notice}</p>}
    {step !== "done" && <div className="auth-field"><label htmlFor="recovery-email">Email</label><input id="recovery-email" type="email" autoComplete="email" required maxLength={254} value={email} readOnly={step === "confirm"} onChange={(event) => setEmail(event.target.value)} /></div>}
    {step === "request" && <button className="auth-submit" disabled={busy}>Send reset code</button>}
    {step === "confirm" && <>
      <div className="auth-field"><label htmlFor="recovery-code">Reset code</label><input id="recovery-code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} /><small>The code expires after 10 minutes. After five attempts, request another code.</small></div>
      <PasswordField id="recovery-password" label="New password" name="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={15} hint="Use 15–128 characters." disabled={busy} />
      <PasswordField id="recovery-confirmation" label="Confirm new password" name="confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" minLength={15} disabled={busy} />
      <button className="auth-submit" disabled={busy}>Reset password</button>
      <button type="button" disabled={busy || cooldown > 0} onClick={request}>{cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}</button>
      <button type="button" disabled={busy} onClick={() => { setStep("request"); setNotice(""); setError(""); setCode(""); setPassword(""); setConfirmation(""); }}>Use another email</button>
    </>}
    {step === "done" && <><p>All previous sessions have been signed out. Log in again on your devices.</p><a className="auth-submit" href="/login">Log in with your new password</a></>}
  </AuthForm>;
}
