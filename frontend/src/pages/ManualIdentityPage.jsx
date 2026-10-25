import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { manualIdentityApi as api } from "../api/manual-identity";
import { profileApi } from "../api/profile";
import ManualIdentityHistory from "../components/profile/ManualIdentityHistory";
import { identityDate, identityLabels, imageLabels } from "./manual-identity-format";
import "./manual-identity.css";

async function loadOwner(signal) {
  // Read the saved version without replacing the app's unsaved profile draft.
  const [data, assets, profile] = await Promise.all([api.owner(signal), api.evidence(signal), profileApi.read(signal)]);
  return { data, assets, profileVersion: profile.version };
}
export default function ManualIdentityPage() {
  const [view, setView] = useState(null), [files, setFiles] = useState({}), [chosen, setChosen] = useState({});
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(null), [notice, setNotice] = useState("");
  const [reloadRequired, setReloadRequired] = useState(false), [pendingRetry, setPendingRetry] = useState(false);
  const lock = useRef(false), retryBody = useRef(null), fileInputs = useRef({});
  useEffect(() => {
    const controller = new AbortController();
    loadOwner(controller.signal).then(setView).catch((e) => { if (e.name !== "AbortError") setError(e); });
    return () => controller.abort();
  }, []);
  const hasFiles = Object.values(files).some(Boolean);
  useEffect(() => {
    if (!hasFiles && !busy && !retryBody.current) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasFiles, busy, error]);
  async function action(fn) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null); setNotice("");
    try { await fn(); } catch (e) { setError(e); if ([401, 403, 409].includes(e.status)) setReloadRequired(true); }
    finally { lock.current = false; setBusy(false); }
  }
  async function reload() {
    await action(async () => { const next = await loadOwner(); setView(next); retryBody.current = null; setPendingRetry(false); setReloadRequired(false);
      setChosen((old) => Object.fromEntries(Object.entries(old).filter(([, id]) => next.assets.some((a) => a.id === id)))); });
  }
  async function upload(kind) {
    const file = files[kind];
    if (!consent || !file || !view?.data.canSubmit || retryBody.current || reloadRequired) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024 || !file.size) {
      setError(new Error("Choose a JPEG, PNG or WebP image no larger than 5 MiB.")); return;
    }
    await action(async () => {
      const asset = await api.upload(kind, file);
      setView((old) => ({ ...old, assets: [asset, ...old.assets] })); setChosen((old) => ({ ...old, [kind]: asset.id }));
      setFiles((old) => ({ ...old, [kind]: null })); if (fileInputs.current[kind]) fileInputs.current[kind].value = ""; setNotice(`${imageLabels[kind]} uploaded privately. Submit the request when both images are ready.`);
    });
  }
  async function submit(event) {
    event.preventDefault();
    if (!view?.data.canSubmit || !consent || reloadRequired || !chosen.GOVERNMENT_ID || !chosen.SELFIE) return;
    await action(async () => {
      retryBody.current ??= { expectedVersion: view.data.request?.version ?? 0, expectedProfileVersion: view.profileVersion,
        idempotencyKey: crypto.randomUUID(), governmentId: chosen.GOVERNMENT_ID, selfie: chosen.SELFIE, consentVersion: view.data.consentVersion };
      setPendingRetry(true);
      await api.submit(retryBody.current);
      // A confirmed submission must never be retried merely because its status refresh fails.
      setReloadRequired(true); setChosen({}); setFiles({}); setConsent(false); retryBody.current = null; setPendingRetry(false);
      setNotice("Your identity request was submitted. Reload the review status if it has not refreshed.");
      setView(await loadOwner()); setReloadRequired(false);
    });
  }
  const data = view?.data, frozen = busy || reloadRequired || pendingRetry;
  return <section className="bw-profile-card bw-identity">
    <Link to="/profile">Back to profile</Link><h1>Identity verification</h1>
    <p>BrightWay reviews your government-issued ID and selfie within five working days. Identity verification is separate from education and experience review.</p>
    <div className="bw-identity-tools"><Link to="/credentials">My credential reviews</Link><Link to="/admin/manual-identity">BrightWay reviewer workspace</Link></div>
    {error && <p role="alert">{error.message}</p>}{notice && <p role="status">{notice}</p>}
    <button type="button" disabled={busy} onClick={reload}>Reload review status</button>
    {reloadRequired && <p>Reload the review status before making another change. Your selected local files will stay here.</p>}
    {!view && !error && <p role="status">Loading identity requirements…</p>}
    {data && <>
      <p className="bw-identity-status">Current status: <strong>{identityLabels[data.status] || data.status}</strong></p>
      {data.identityVerified && <p role="status">BrightWay has verified your identity.</p>}
      {data.request && <p>Review target: <strong>{identityDate(data.request.targetAt)}</strong>{data.request.overdue && " · The review target has passed. This does not automatically approve your request."}</p>}
      <h2>Before you request verification</h2>
      <ul className="bw-identity-checks">{data.eligibility.checks.map((check) => <li key={check.code}>{check.satisfied ? "✓ Met" : "Still needed"} — {check.label}</li>)}</ul>
      {!data.identityDetailsComplete && <p>Your saved account needs your name and date of birth before review. Contact BrightWay support if those details are missing.</p>}
      {!data.submissionConfigured && <p>New requests are temporarily unavailable. Please try again later.</p>}
      {!data.eligibility.requirementsMet && <p><Link to="/profile">Complete your profile</Link> and verify at least one education and one experience record before uploading identity images.</p>}
      {data.canSubmit && <form onSubmit={submit}>
        <h2>{data.status === "NOT_STARTED" ? "Request identity verification" : "Submit a new identity revision"}</h2>
        <p>Use clear images with readable details and your face visible. Images must be JPEG, PNG or WebP, up to 5 MiB each. Unsubmitted uploads expire after 24 hours. Selected files are kept only while this page stays open.</p>
        <p>BrightWay reviewers can access these private images for identity review. Submitted images and the identity snapshot are retained for {data.retentionDays} days after a decision. Basic decision and security audit records are retained separately. Pending requests expire after 30 calendar days. Working days: {data.workingDays}.</p>
        <label className="bw-identity-consent"><input type="checkbox" checked={consent} disabled={frozen} onChange={(e) => setConsent(e.target.checked)} />I consent to BrightWay privately storing and reviewing my government-issued ID and selfie under this notice.</label>
        {Object.entries(imageLabels).map(([kind, label]) => <fieldset key={kind} disabled={frozen || !consent}>
          <legend>{label}</legend>
          <label htmlFor={`identity-file-${kind}`}>Choose {label}</label>
          <input ref={(node) => { fileInputs.current[kind] = node; }} id={`identity-file-${kind}`} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFiles((old) => ({ ...old, [kind]: e.target.files[0] || null }))} />
          {files[kind] && <p>Selected: {files[kind].name}</p>}
          <button type="button" disabled={!files[kind]} onClick={() => upload(kind)}>Upload {label}</button>
          <label htmlFor={`identity-choice-${kind}`}>Uploaded {label}</label>
          <select id={`identity-choice-${kind}`} value={chosen[kind] || ""} onChange={(e) => setChosen((old) => ({ ...old, [kind]: e.target.value }))}>
            <option value="">Select an uploaded image</option>
            {view.assets.filter((a) => a.kind === kind).map((a, i) => <option key={a.id} value={a.id}>Upload {i + 1} · expires {identityDate(a.expiresAt)}</option>)}
          </select>
          {chosen[kind] && <div className="bw-identity-tools">
            <button type="button" onClick={() => action(() => api.download(chosen[kind], false))}>Download selected {label}</button>
            <button type="button" onClick={() => action(async () => { const id = chosen[kind]; await api.remove(id); setView((old) => ({ ...old, assets: old.assets.filter((a) => a.id !== id) })); setChosen((old) => ({ ...old, [kind]: "" })); })}>Remove selected {label}</button>
          </div>}
        </fieldset>)}
        <button className="bw-profile-button" type="submit" disabled={busy || reloadRequired || !consent || !chosen.GOVERNMENT_ID || !chosen.SELFIE}>{pendingRetry ? "Retry same identity request" : "Submit identity request"}</button>
        {pendingRetry && <p>The response was not confirmed. Retry uses the same request to avoid duplicate submissions. Reload the review status to check whether it arrived.</p>}
      </form>}
      <ManualIdentityHistory attempts={data.attempts} busy={busy} onDownload={(id) => action(() => api.download(id))} />
    </>}
  </section>;
}
