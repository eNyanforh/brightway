import { useState } from "react";
import AccountEmailVerification from "./AccountEmailVerification";
import "./profile-completion.css";

export default function ProfileCompletion({ profile, busy, dirty, onEdit, onRefresh, onBusy, onVerified }) {
  const [showEmail, setShowEmail] = useState(false);
  const [error, setError] = useState("");
  const completion = profile.completion;
  const current = completion?.profileVersion === profile.version && Array.isArray(completion?.checks);
  const missing = current ? completion.checks.filter((item) => !item.satisfied).length : 0;
  const verifiedEmail = current
    ? completion.checks.some((item) => item.code === "EMAIL_VERIFICATION_REQUIRED" && item.satisfied)
    : Boolean(profile.contact?.emailVerifiedAt);
  async function refresh() {
    setError("");
    try { await onRefresh(); }
    catch (failure) { setError(failure.message); }
  }
  return <section className="bw-profile-card bw-profile-side-block bw-profile-completion" aria-labelledby="profile-checklist-title">
    <h2 id="profile-checklist-title">Profile checklist</h2>
    <p>This checklist uses your saved profile information.</p>
    {dirty && <p className="bw-completion-note">Save your edits to update the checklist.</p>}
    {!current ? <p>Refresh to see your latest profile requirements.</p>
      : <>
        <p className="bw-completion-summary">{missing ? `${missing} ${missing === 1 ? "item needs" : "items need"} attention.` : completion.complete === true ? "Profile information complete." : "All current requirements are met."}</p>
        <ul className="bw-completion-list">
          {completion.checks.map((item) => <li key={item.code}>
            <span className={item.satisfied ? "bw-completion-done" : "bw-completion-missing"} aria-hidden="true">{item.satisfied ? "✓" : "○"}</span>
            <span>{item.label}<small>{item.satisfied ? "Done" : "Needed"}</small></span>
            {!item.satisfied && <button type="button" className="bw-profile-text-button" disabled={busy}
              aria-label={item.editor === "email" ? "Verify your email" : `Complete ${item.label.toLowerCase()}`}
              onClick={() => item.editor === "email" ? setShowEmail(true) : onEdit(item.editor)}>
              {item.editor === "email" ? "Verify" : "Add"}
            </button>}
          </li>)}
        </ul>
      </>}
    <p>Completing your information does not verify your identity. Submit saved education and experience records through their verification details. Individual identity review will be available in a later update.</p>
    {error && <p className="bw-completion-note">{error}</p>}
    <button type="button" className="bw-profile-text-button" disabled={busy} onClick={refresh}>Refresh checklist</button>
    {showEmail && !verifiedEmail && <AccountEmailVerification email={profile.contact?.email} busy={busy}
      onBusy={onBusy} onVerified={onVerified} onClose={() => setShowEmail(false)} />}
  </section>;
}
