import { useEffect, useRef, useState } from "react";
import { organizationProfileApi as api } from "../../api/organization-profile";
import "./organization-profile-editor.css";
export default function OrganizationProfileEditor({ profile, required = false, onSaved, onClose }) {
  const dialog = useRef(null), lock = useRef(false), alive = useRef(false), controller = useRef(null);
  const [saved, setSaved] = useState(profile), [step, setStep] = useState(required && profile.username ? 2 : 1);
  const [username, setUsername] = useState(profile.username || ""), [file, setFile] = useState(null), [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(null), [uncertain, setUncertain] = useState(false);
  const id = profile.organization.id;
  useEffect(() => {
    alive.current = true; const previous = document.activeElement, element = dialog.current;
    element.showModal();
    return () => { alive.current = false; controller.current?.abort(); element.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => { dialog.current?.querySelector(step === 1 ? "#organization-username" : "#organization-profile-picture")?.focus(); }, [step]);
  useEffect(() => {
    if (!file) return;
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [file, preview]);
  async function action(work) {
    if (lock.current) return;
    lock.current = true; controller.current = new AbortController(); setBusy(true); setError(null);
    try { await work(controller.current.signal); }
    catch (error) { if (alive.current) { setError(error); setUncertain(!error.status || (error.status === 409 && !error.message.includes("username is unavailable")) || error.status >= 500); } }
    finally { if (alive.current) { lock.current = false; setBusy(false); } }
  }
  async function next(event) {
    event.preventDefault();
    if (uncertain) return;
    await action(async signal => {
      const value = username.trim().toLowerCase();
      const updated = value === saved.username ? saved : await api.save(id, value, saved.version, signal);
      if (alive.current) { setSaved(updated); setUsername(updated.username); setStep(2); }
    });
  }
  async function finish(event) {
    event.preventDefault();
    if (uncertain || (!file && !saved.photo)) return;
    await action(async signal => {
      const updated = file ? await api.upload(id, file, saved.version, signal) : saved;
      if (alive.current) {
        if (updated.required) throw new Error("Setup is incomplete. Reload the saved profile and try again.");
        onSaved(updated);
      }
    });
  }
  function choose(event) {
    const value = event.target.files?.[0];
    if (!value) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(value.type) || value.size > 5 * 1024 * 1024) { setError(new Error("Choose a JPEG, PNG or WebP picture up to 5 MiB.")); event.target.value = ""; return; }
    setFile(value); setPreview(URL.createObjectURL(value)); setError(null);
  }
  return <dialog ref={dialog} className="bw-org-profile-dialog" aria-labelledby="organization-setup-title" aria-describedby="organization-setup-description" onCancel={event => { event.preventDefault(); if (!required && !busy) onClose?.(); }}>
    <div className="bw-org-profile-editor">
      <div className="bw-org-setup-topline"><span>Step {step} of 2</span>{!required && <button type="button" className="bw-org-setup-secondary" disabled={busy} onClick={onClose}>Close</button>}</div>
      <h2 id="organization-setup-title">{required ? "Set up your organization" : "Edit Profile"}</h2>
      <p id="organization-setup-description">{required ? `Add a username and profile picture for ${profile.organization.name} to open its workspace.` : `Update the username or profile picture for ${profile.organization.name}.`}</p>
      <ol className="bw-org-setup-steps" aria-label="Organization setup steps"><li aria-current={step === 1 ? "step" : undefined}>1. Username</li><li aria-current={step === 2 ? "step" : undefined}>2. Profile picture</li></ol>
      {error && <p role="alert">{error.message}</p>}
      {error?.status === 403 && <p><a href="/security" target="_blank" rel="noopener noreferrer">Open Account security</a> to check two-factor authentication, then reload the saved profile.</p>}
      {(uncertain || error) && <button type="button" className="bw-org-setup-secondary" disabled={busy} onClick={() => action(async signal => { const latest = await api.read(id, signal); if (alive.current) { setSaved(latest); setUsername(latest.username || ""); setUncertain(false); setStep(latest.username ? 2 : 1); if (required && (!latest.required || !latest.canEdit)) onSaved(latest); } })}>Reload saved profile</button>}
      {step === 1 ? <form onSubmit={next}><label htmlFor="organization-username">Organization username</label><div className="bw-org-username-field"><span aria-hidden="true">@</span><input id="organization-username" autoFocus autoComplete="off" spellCheck={false} required minLength={3} maxLength={30} pattern="[a-zA-Z][a-zA-Z0-9_]{2,29}" aria-describedby="organization-username-hint" value={username} disabled={busy} onChange={event => setUsername(event.target.value)} /></div><p id="organization-username-hint">3–30 characters. Start with a letter; use letters, numbers or underscores. This is your organization’s public username, not a separate login.</p><button disabled={busy || uncertain} type="submit">{busy ? "Saving…" : "Save and continue"}</button></form>
        : <form onSubmit={finish}><p>Username saved: <strong>@{saved.username}</strong></p><label htmlFor="organization-profile-picture">Organization profile picture</label>{(file ? preview : saved.photo?.url) && <img className="bw-org-setup-preview" src={file ? preview : saved.photo.url} alt={file ? "Selected organization picture preview" : "Current organization profile picture"} />}<input id="organization-profile-picture" type="file" accept="image/jpeg,image/png,image/webp" required={!saved.photo && !file} disabled={busy} onChange={choose} aria-describedby="organization-photo-hint" /><p id="organization-photo-hint">Use your organization’s logo or picture. JPEG, PNG or WebP, up to 5 MiB and at least 128 × 128 pixels. This picture is public.</p>{file && <p>{file.name}</p>}<div className="bw-org-setup-actions"><button type="button" className="bw-org-setup-secondary" disabled={busy} onClick={() => { setStep(1); setError(null); }}>Back</button><button type="submit" disabled={busy || uncertain || (!file && !saved.photo)}>{busy ? "Saving picture…" : required ? "Finish setup" : "Save Profile"}</button></div></form>}
      {required && <p className="bw-org-setup-required">Both steps are required before using this organization’s workspace.</p>}
    </div>
  </dialog>;
}
