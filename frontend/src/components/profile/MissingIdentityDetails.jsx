import { useRef, useState } from "react";
import { manualIdentityApi } from "../../api/manual-identity";
import PasswordField from "../auth/PasswordField";
const fields = { firstName: { label: "First name", autoComplete: "given-name" }, lastName: { label: "Last name", autoComplete: "family-name" }, birthDate: { label: "Date of birth", autoComplete: "bday" } };
export default function MissingIdentityDetails({ missing, revision, disabled, onBusy, onSaved }) {
  const [values, setValues] = useState({}), [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(null), [saved, setSaved] = useState(false), [stale, setStale] = useState(false);
  const lock = useRef(false);
  const needed = missing.filter((key) => Object.hasOwn(fields, key));
  async function submit(event) {
    event.preventDefault();
    if (lock.current || disabled || stale || saved || !password || !needed.length || needed.some((key) => !values[key])) return;
    lock.current = true; setBusy(true); onBusy(true); setError(null);
    try {
      await manualIdentityApi.completeDetails({ expectedIdentityRevision: revision, password,
        changes: Object.fromEntries(needed.map((key) => [key, values[key]])) });
      setSaved(true); setPassword(""); await onSaved();
    } catch (failure) { setError(failure); setPassword(""); if ([401, 403, 409].includes(failure.status)) setStale(true); }
    finally { lock.current = false; setBusy(false); onBusy(false); }
  }
  return <div className="bw-identity-details">
    <h2>Complete missing personal details</h2>
    <p>Your saved account is missing {needed.map((key) => fields[key].label.toLowerCase()).join(" and ")}. Add the missing details so BrightWay can compare your identity documents with your account. Existing saved details cannot be changed here.</p>
    {error && <p role="alert">{error.message}</p>}
    {saved ? <p role="status">Personal details saved. Reload review status if the upload form has not appeared.</p> : <form onSubmit={submit}><fieldset disabled={busy || disabled || stale}>
      {needed.map((key) => <div key={key}><label htmlFor={`identity-detail-${key}`}>{fields[key].label}</label>
        <input id={`identity-detail-${key}`} name={key} type={key === "birthDate" ? "date" : "text"} autoComplete={fields[key].autoComplete}
          min={key === "birthDate" ? "0001-01-01" : undefined} max={key === "birthDate" ? new Date().toISOString().slice(0, 10) : undefined}
          maxLength={key === "birthDate" ? undefined : 100} required value={values[key] || ""} onChange={(e) => setValues((old) => ({ ...old, [key]: e.target.value }))} />
      </div>)}
      <PasswordField id="identity-details-password" label="Current password" name="password" value={password} autoComplete="current-password" disabled={busy || disabled || stale} onChange={(e) => setPassword(e.target.value)} />
      <button type="submit" className="bw-profile-button" disabled={busy || disabled || stale || !password || needed.some((key) => !values[key])}>{busy ? "Saving personal details…" : "Save missing personal details"}</button>
    </fieldset></form>}
    {stale && <p>Reload review status before retrying. Sign in again if your session or password has changed.</p>}
  </div>;
}
