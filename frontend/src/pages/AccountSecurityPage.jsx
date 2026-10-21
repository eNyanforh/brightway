import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { authApi } from "../api/auth";
import PasswordField from "../components/auth/PasswordField";
import "./profile.css";
export default function AccountSecurityPage() {
  const [data, setData] = useState(null), [setup, setSetup] = useState(null), [codes, setCodes] = useState([]);
  const [password, setPassword] = useState(""), [code, setCode] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => { const controller = new AbortController(); authApi.mfaStatus(controller.signal).then(setData).catch((e) => { if (e.name !== "AbortError") setError(e.message); }); return () => controller.abort(); }, []);
  async function action(fn) {
    if (lock.current) return; lock.current = true; setBusy(true); setError(""); setNotice("");
    try { await fn(); } catch (e) { setError(e.message); }
    finally { lock.current = false; setBusy(false); }
  }
  async function begin() {
    await action(async () => { setSetup(await authApi.beginMfa(password)); setPassword(""); setCode(""); });
  }
  async function enable() {
    await action(async () => { const result = await authApi.enableMfa(code.trim()); setCodes(result.backupCodes); setSetup(null); setCode(""); setData({ enabled: true, backupCodesRemaining: result.backupCodes.length, canRegenerateWithPassword: true }); setNotice("Two-factor authentication is enabled. Other sessions have been signed out."); });
  }
  async function change(disable) {
    await action(async () => {
      const result = disable ? await authApi.disableMfa(password, code.trim()) : await authApi.regenerateMfaCodes(password, code.trim());
      setCodes(result.backupCodes ?? []); setCode(""); setPassword(""); setData({ enabled: result.enabled, backupCodesRemaining: result.backupCodes?.length ?? 0, canRegenerateWithPassword: result.canRegenerateWithPassword === true });
      setNotice(disable ? "Two-factor authentication is disabled. Reviewer tools are unavailable until you enable it again." : "New backup codes created. Previous backup codes no longer work. Other sessions have been signed out.");
    });
  }
  function download() {
    const url = URL.createObjectURL(new Blob(["BrightWay backup codes — keep private. Each code works once.\n\n" + codes.join("\n")], { type: "text/plain" }));
    const link = document.createElement("a"); link.href = url; link.download = "brightway-backup-codes.txt"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="bw-profile-card">
    <Link to="/profile">Back to profile</Link><h1>Account security</h1>
    <p>Two-factor authentication adds a code after your password. It is optional for individuals and required for Admin and reviewer tools.</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!data && !error && <p role="status">Loading security settings…</p>}
    {data && <>
      <p>Two-factor authentication: <strong>{data.enabled ? "Enabled" : "Not enabled"}</strong></p>
      {codes.length > 0 ? <>
        <h2>Save your backup codes</h2><p>These codes are shown only now. Save them somewhere private, separate from your authenticator. Each works once when your authenticator is unavailable.</p>
        <ul>{codes.map((value) => <li key={value}><code>{value}</code></li>)}</ul>
        <button type="button" onClick={download}>Download backup codes</button><button type="button" onClick={() => setCodes([])}>I saved my codes</button>
      </> : setup ? <form onSubmit={(e) => { e.preventDefault(); void enable(); }}><fieldset disabled={busy}>
        <h2>Connect an authenticator app</h2><p>In your authenticator, add an account using a setup key. Enter these details:</p>
        <dl><dt>Account</dt><dd>{setup.accountLabel}</dd><dt>Setup key</dt><dd><code style={{ overflowWrap: "anywhere" }}>{setup.secret}</code></dd><dt>Type</dt><dd>Time based · 6 digits · 30 seconds</dd></dl>
        <p>Setup expires after ten minutes. Keep the setup key private. Wait for a new app code if you just used the previous one.</p>
        <label htmlFor="mfa-enable-code">Authenticator code</label><input id="mfa-enable-code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
        <button disabled={busy}>Enable two-factor authentication</button><button type="button" disabled={busy} onClick={() => { setSetup(null); setCode(""); }}>Cancel setup</button>
      </fieldset></form> : <form onSubmit={(e) => { e.preventDefault(); if (!data.enabled) void begin(); }}><fieldset disabled={busy}>
        {data.enabled && <p>{data.backupCodesRemaining} unused backup codes remain. Changing these settings requires your current password and a fresh authenticator or unused backup code.</p>}
        <PasswordField id="security-password" label="Current password" name="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" disabled={busy} />
        {data.enabled ? <>
          {data.canRegenerateWithPassword && <p>You verified your second factor recently. For five minutes after that verification, you can leave the code blank and use your current password to generate replacement backup codes.</p>}
          <label htmlFor="security-code">Authenticator or backup code</label><input id="security-code" required autoComplete="one-time-code" minLength={6} maxLength={27} value={code} onChange={(e) => setCode(e.target.value)} />
          <button type="button" disabled={busy || !password || (!code && !data.canRegenerateWithPassword)} onClick={() => void change(false)}>Generate new backup codes</button>
          <button type="button" disabled={busy || !password || !code} onClick={() => { if (window.confirm("Disable two-factor authentication? Reviewer access will be blocked until it is enabled again.")) void change(true); }}>Disable two-factor authentication</button>
        </> : <button disabled={busy}>Set up authenticator</button>}
      </fieldset></form>}
    </>}
    <p>Password recovery does not disable two-factor authentication. If you lose your authenticator, use one of your saved backup codes at login.</p>
  </section>;
}
