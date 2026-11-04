import { useEffect, useRef, useState } from "react";
import { managementAuthApi } from "../../api/management-auth";
import WorkspaceIcon from "../workspace/WorkspaceIcon";
export default function ManagementActionDialog({ title, description, onConfirm, onClose }) {
  const dialog = useRef(null), lock = useRef(false);
  const [reason, setReason] = useState(""), [password, setPassword] = useState(""), [code, setCode] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(null), [uncertain, setUncertain] = useState(false);
  useEffect(() => { const node = dialog.current; node.showModal(); return () => node.close(); }, []);
  return <dialog className="bw-mgmt-action-dialog" ref={dialog} aria-labelledby="management-action-title" onCancel={event => { if (lock.current) event.preventDefault(); else onClose(); }}>
    <header><span><WorkspaceIcon name="shield" size={23} /></span><button type="button" aria-label="Close action confirmation" disabled={busy} onClick={onClose}><WorkspaceIcon name="close" /></button></header>
    <p className="bw-mgmt-card-eyebrow">CONFIRM SENSITIVE ACTION</p><h2 id="management-action-title">{title}</h2><p>{description}</p>
    {error && <p role="alert">{error.message}{uncertain && " Reload the saved record before trying another action."}</p>}
    <form onSubmit={async event => { event.preventDefault(); if (lock.current || uncertain) return; lock.current = true; setBusy(true); setError(null);
      let attempted = false;
      try { await managementAuthApi.stepUp({ password, code }); setPassword(""); setCode(""); attempted = true; await onConfirm(reason); }
      catch (failure) { setError(failure); if (attempted) setUncertain(true); }
      finally { lock.current = false; setBusy(false); }
    }}><fieldset disabled={busy || uncertain}>
      <label>Reason for this action<textarea required minLength={10} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <label>Your management password<input type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /></label>
      <label>Fresh management MFA code<input required autoComplete="one-time-code" maxLength={32} value={code} onChange={e => setCode(e.target.value)} /></label>
      <button className="bw-mgmt-primary" type="submit">{busy ? "Confirming…" : "Confirm action"}</button>
    </fieldset></form><button type="button" className="bw-mgmt-secondary" disabled={busy} onClick={onClose}>{uncertain ? "Close and reload record" : "Cancel"}</button>
  </dialog>;
}
