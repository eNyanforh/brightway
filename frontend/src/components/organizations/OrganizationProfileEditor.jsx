import { useEffect, useRef, useState } from "react";
import { organizationProfileApi as api } from "../../api/organization-profile";
import WorkspaceIcon from "../workspace/WorkspaceIcon";
import "./organization-profile-editor.css";
const steps = ["Username", "Photo", "Phone", "Email", "Website"];
const contactFields = { 3: "phoneNumber", 4: "contactEmail", 5: "website" };
const labels = { 3: "Organization phone number", 4: "Organization email", 5: "Organization website" };
const headings = ["Choose your username", "Add your organization photo", "Add a phone number", "Add an email address", "Add your website"];
const resumeStep = profile => profile.nextStep || (profile.photo ? 3 : profile.username ? 2 : 1);
export default function OrganizationProfileEditor({ profile, required = false, onSaved, onClose }) {
  const dialog = useRef(null), lock = useRef(false), alive = useRef(false), controller = useRef(null);
  const [saved, setSaved] = useState(profile), [step, setStep] = useState(required ? resumeStep(profile) : 1);
  const [username, setUsername] = useState(profile.username || ""), [file, setFile] = useState(null), [preview, setPreview] = useState(null);
  const [contacts, setContacts] = useState({ phoneNumber: profile.phoneNumber || "", contactEmail: profile.contactEmail || "", website: profile.website || "" });
  const [busy, setBusy] = useState(false), [error, setError] = useState(null), [uncertain, setUncertain] = useState(false);
  const id = profile.organization.id, field = contactFields[step];
  useEffect(() => {
    alive.current = true; const previous = document.activeElement, element = dialog.current;
    element.showModal();
    return () => { alive.current = false; controller.current?.abort(); element.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => { dialog.current?.querySelector("[data-step-input]")?.focus(); }, [step]);
  useEffect(() => { if (preview) return () => URL.revokeObjectURL(preview); }, [preview]);
  async function action(work) {
    if (lock.current) return;
    lock.current = true; controller.current = new AbortController(); setBusy(true); setError(null);
    try { await work(controller.current.signal); }
    catch (error) { if (alive.current) { setError(error); setUncertain(!error.status || (error.status === 409 && !error.message.includes("username is unavailable")) || error.status >= 500); } }
    finally { if (alive.current) { lock.current = false; setBusy(false); } }
  }
  function accept(updated, next) {
    if (!alive.current) return;
    setSaved(updated);
    if (next === 6) {
      if (updated.required) throw new Error("Setup is incomplete. Reload the saved profile and try again.");
      onSaved(updated);
    } else setStep(next);
  }
  async function submit(event) {
    event.preventDefault();
    if (uncertain) return;
    await action(async signal => {
      if (step === 1) {
        const value = username.trim().toLowerCase();
        const updated = value === saved.username ? saved : await api.save(id, value, saved.version, signal);
        if (alive.current) setUsername(updated.username);
        accept(updated, 2);
      } else if (step === 2) {
        if (!file && !saved.photo) return;
        const updated = file ? await api.upload(id, file, saved.version, signal) : saved;
        if (alive.current && file) { setFile(null); setPreview(null); }
        accept(updated, 3);
      } else {
        const updated = await api.contact(id, field, contacts[field].trim() || null, saved.version, signal);
        if (alive.current) setContacts(values => ({ ...values, [field]: updated[field] || "" }));
        accept(updated, step + 1);
      }
    });
  }
  function skip() {
    if (uncertain) return;
    void action(async signal => {
      // Skip retains an existing saved contact. Clearing and continuing removes it explicitly.
      const updated = await api.contact(id, field, saved[field] ?? null, saved.version, signal);
      if (alive.current) setContacts(values => ({ ...values, [field]: updated[field] || "" }));
      accept(updated, step + 1);
    });
  }
  function choose(event) {
    const value = event.target.files?.[0];
    if (!value) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(value.type) || value.size > 5 * 1024 * 1024) { setError(new Error("Choose a JPEG, PNG or WebP picture up to 5 MiB.")); event.target.value = ""; return; }
    setFile(value); setPreview(URL.createObjectURL(value)); setError(null);
  }
  function reload() {
    void action(async signal => {
      const latest = await api.read(id, signal);
      if (!alive.current) return;
      setSaved(latest); setUsername(latest.username || ""); setUncertain(false);
      setContacts({ phoneNumber: latest.phoneNumber || "", contactEmail: latest.contactEmail || "", website: latest.website || "" });
      setStep(required ? resumeStep(latest) : step);
      if (required && (!latest.required || !latest.canEdit)) onSaved(latest);
    });
  }
  return <dialog ref={dialog} className="bw-org-profile-dialog" aria-labelledby="organization-setup-title" aria-describedby="organization-setup-description" onCancel={event => { event.preventDefault(); if (!required && !busy) onClose?.(); }}>
    <div className="bw-org-setup-banner"><span className="bw-org-setup-symbol"><WorkspaceIcon size={24} /></span><div><h2 id="organization-setup-title">{required ? "Organization Setup" : "Edit Profile"}</h2><p id="organization-setup-description">{profile.organization.name}</p></div>{!required && <button type="button" className="bw-org-setup-close" aria-label="Close editor" disabled={busy} onClick={onClose}><WorkspaceIcon name="close" size={20} /></button>}</div>
    <div className="bw-org-profile-editor">
      <div className="bw-org-setup-topline"><span>Step {step} of 5</span><span>{step <= 2 ? "Required" : "Optional"}</span></div>
      <ol className="bw-org-setup-steps" aria-label="Organization setup steps">{steps.map((label, index) => <li key={label} className={step > index + 1 ? "is-complete" : ""} aria-current={step === index + 1 ? "step" : undefined}><span>{step > index + 1 ? <WorkspaceIcon name="check" size={13} /> : index + 1}</span>{label}</li>)}</ol>
      <h3>{headings[step - 1]}</h3>
      {error && <p role="alert">{error.message}</p>}
      {error?.status === 403 && <p><a href="/security" target="_blank" rel="noopener noreferrer">Open Account security</a> to check two-factor authentication, then reload the saved profile.</p>}
      {(uncertain || error) && <button type="button" className="bw-org-setup-secondary" disabled={busy} onClick={reload}>Reload saved profile</button>}
      <form onSubmit={submit}>
        {step === 1 && <><label htmlFor="organization-username">Organization username</label><div className="bw-org-username-field"><span aria-hidden="true">@</span><input data-step-input id="organization-username" autoComplete="off" spellCheck={false} required minLength={3} maxLength={30} pattern="[a-zA-Z][a-zA-Z0-9_]{2,29}" aria-describedby="organization-field-hint" value={username} disabled={busy} onChange={event => setUsername(event.target.value)} /></div><p id="organization-field-hint">3–30 characters. Start with a letter; use letters, numbers or underscores. Your organization keeps your existing BrightWay login.</p></>}
        {step === 2 && <><label htmlFor="organization-profile-picture">Organization profile picture</label><div className="bw-org-photo-choice">{(file ? preview : saved.photo?.url) ? <img className="bw-org-setup-preview" src={file ? preview : saved.photo.url} alt={file ? "Selected organization picture preview" : "Current organization profile picture"} /> : <span className="bw-org-setup-photo-placeholder"><WorkspaceIcon size={36} /></span>}<div><input data-step-input id="organization-profile-picture" type="file" accept="image/jpeg,image/png,image/webp" required={!saved.photo && !file} disabled={busy} onChange={choose} aria-describedby="organization-field-hint" /><p id="organization-field-hint">Choose a logo or picture. JPEG, PNG or WebP, up to 5 MiB; at least 128 × 128 pixels. This picture is public.</p></div></div>{file && <p className="bw-org-selected-file">{file.name}</p>}</>}
        {step >= 3 && <><label htmlFor={`organization-${field}`}>{labels[step]} <span className="bw-org-optional">Optional</span></label><input data-step-input className="bw-org-contact-input" id={`organization-${field}`} type={step === 4 ? "email" : step === 3 ? "tel" : "text"} inputMode={step === 5 ? "url" : step === 4 ? "email" : "tel"} autoComplete="off" maxLength={step === 3 ? 40 : step === 4 ? 254 : 2048} placeholder={step === 3 ? "+231 …" : step === 4 ? "hello@yourorganization.com" : "https://yourorganization.com"} value={contacts[field]} disabled={busy} onChange={event => setContacts(values => ({ ...values, [field]: event.target.value }))} aria-describedby="organization-field-hint" /><p id="organization-field-hint">{step === 3 ? "Use an international number starting with + and its country code." : step === 4 ? "Use an organization contact email. This does not change your sign-in email or verify ownership." : "Enter your website address, such as example.com or https://example.com."} This is shown on your public organization profile. Leave it blank to remove it, or skip to keep the saved value.</p></>}
        <div className="bw-org-setup-actions"><div>{step > 1 && <button type="button" className="bw-org-setup-secondary" disabled={busy} onClick={() => { setStep(value => value - 1); setError(null); }}>Back</button>}</div><div>{step >= 3 && <button type="button" className="bw-org-setup-skip" disabled={busy || uncertain} onClick={skip}>{step === 5 ? "Skip and finish" : "Skip for now"}</button>}<button type="submit" disabled={busy || uncertain || (step === 2 && !file && !saved.photo)}>{busy ? "Saving…" : step === 5 ? required ? "Finish setup" : "Save Profile" : step === 2 ? "Save photo and continue" : "Save and continue"}</button></div></div>
      </form>
      <p className="bw-org-setup-note">{required ? "Username and photo are required. Phone, email and website are optional." : "Changes save as you continue. Your approved organization details stay the same."}</p>
    </div>
  </dialog>;
}
