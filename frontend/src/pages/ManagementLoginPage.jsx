import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import SuperadminAuthFrame from "../components/auth/SuperadminAuthFrame";
import { useManagement } from "../auth/management-context";
import { managementAuthApi } from "../api/management-auth";
export default function ManagementLoginPage() {
  const management = useManagement(), navigate = useNavigate();
  const [step, setStep] = useState("password"), [identifier, setIdentifier] = useState(""), [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState("");
  const [code, setCode] = useState(""), [emailCode, setEmailCode] = useState(""), [setup, setSetup] = useState(null), [backups, setBackups] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false);
  const locked = useRef(false);
  async function submit(event) {
    event.preventDefault(); if (locked.current) return;
    locked.current = true; setBusy(true); setError(null);
    try {
      if (step === "password") {
        const result = await management.login({ identifier, password }); setPassword(""); setCode(""); setEmailCode(""); setSetup(result); setStep(result.step);
      } else if (step === "recover") {
        await managementAuthApi.recover(identifier); setPassword(""); setConfirmation(""); setCode(""); setEmailCode(""); setStep("reset");
      } else if (step === "reset") {
        if (password !== confirmation) throw Error("Passwords do not match.");
        await managementAuthApi.reset({ password, code, emailCode }); setPassword(""); setConfirmation(""); setCode(""); setEmailCode(""); setStep("password");
      } else {
        const result = await management.verify({ code, ...(step === "enroll" ? { emailCode } : {}) });
        setCode(""); setEmailCode(""); setSetup(null);
        if (result.backupCodes) { setBackups(result.backupCodes); setStep("backups"); } else navigate("/superadmin", { replace: true });
      }
    } catch (failure) { setError(failure); }
    finally { locked.current = false; setBusy(false); }
  }
  const title = { password: "Management sign-in", mfa: "Verify management MFA", enroll: "Set up your management identity", recover: "Recover management password", reset: "Confirm management recovery", backups: "Save management backup codes" }[step];
  function startRecovery() { setPassword(""); setConfirmation(""); setSetup(null); setCode(""); setEmailCode(""); setError(null); setStep("recover"); }
  return <SuperadminAuthFrame title={title} description="Use your separate BrightWay Management credentials. Personal BrightWay accounts cannot sign in here." onSubmit={submit} busy={busy} error={error?.message}>
    {step === "backups" ? <><p>Store these codes privately. They are displayed only now and cannot recover a personal account.</p><ul>{(backups || []).map(value => <li key={value}><code>{value}</code></li>)}</ul><button type="button" onClick={() => { setBackups(null); setStep("password"); navigate("/superadmin", { replace: true }); }}>I saved my backup codes</button></> : <>
      {step === "password" && management.staff && <button type="button" onClick={() => navigate("/superadmin", { replace: true })}>Continue to Management</button>}
      {["password", "recover"].includes(step) && <label>{step === "recover" ? "Management email" : "Management username or email"}<input autoComplete="username" type={step === "recover" ? "email" : "text"} required maxLength={254} value={identifier} onChange={e => setIdentifier(e.target.value)} /></label>}
      {["password", "reset"].includes(step) && <label>{step === "reset" ? "New management password" : "Management password"}<input type="password" autoComplete={step === "reset" ? "new-password" : "current-password"} required minLength={step === "reset" ? 12 : 1} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /></label>}
      {step === "reset" && <label>Confirm new management password<input type="password" autoComplete="new-password" required maxLength={128} value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>}
      {step === "enroll" && <><p>Add a new authenticator entry: issuer <strong>BrightWay Management</strong>, account {setup.accountLabel}. Keep this enrollment secret private.</p><code aria-label="Management authenticator secret">{setup.secret}</code><p>Use SHA-1, six digits, 30 seconds. Verify both your management email and authenticator to activate this staff identity.</p></>}
      {["enroll", "reset"].includes(step) && <label>Management email verification code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required minLength={6} maxLength={6} value={emailCode} onChange={e => setEmailCode(e.target.value.replace(/\D/g, ""))} /></label>}
      {["enroll", "mfa", "reset"].includes(step) && <label>{step === "enroll" ? "Management authenticator code" : "Management authenticator or backup code"}<input required autoComplete="one-time-code" maxLength={32} value={code} onChange={e => setCode(e.target.value)} /></label>}
      {step === "reset" && <p>Only a registered management email receives a recovery code. Your existing management second factor is still required.</p>}
      <button className="auth-submit" type="submit">{busy ? "Please wait…" : step === "recover" ? "Request management recovery" : step === "reset" ? "Reset management password" : step === "password" ? "Continue securely" : "Verify management access"}</button>
      {step === "password" && <button type="button" onClick={startRecovery}>Forgot management password?</button>}
      {step !== "password" && <button type="button" disabled={busy} onClick={async () => { if (locked.current) return; locked.current = true; setBusy(true); try { await management.logout(); setPassword(""); setCode(""); setEmailCode(""); setSetup(null); setStep("password"); } catch (e) { setError(e); } finally { locked.current = false; setBusy(false); } }}>Cancel and return to management sign-in</button>}
    </>}
  </SuperadminAuthFrame>;
}
