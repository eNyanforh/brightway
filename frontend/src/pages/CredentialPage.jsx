import { useEffect, useRef, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { credentialsApi } from "../api/credentials";
import { editorFields, formFromProfile } from "./profile-form";
import { CredentialTimeline } from "../components/profile/CredentialTimeline";
import { credentialLabels, rebaseCredentialProfile } from "./credential-form";
import "./credentials.css";

export default function CredentialPage() {
  const { kind, recordId } = useParams();
  const { profileDraft: draft, setProfileDraft, reloadProfile } = useOutletContext();
  const [data, setData] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false), [files, setFiles] = useState([]);
  const locked = useRef(false), uploaded = useRef(new Map());
  const validKind = ["education", "experience"].includes(kind);
  useEffect(() => {
    const controller = new AbortController();
    if (validKind) credentialsApi.owner(kind, recordId, controller.signal).then(setData).catch((e) => { if (e.name !== "AbortError") setError(e); });
    return () => controller.abort();
  }, [kind, recordId, validKind]);
  async function reload() {
    if (locked.current) return;
    setError(null);
    try { setData(await credentialsApi.owner(kind, recordId)); } catch (e) { setError(e); }
  }
  const saved = draft ? formFromProfile(draft.profile) : null;
  const dirtyHistory = saved && validKind && editorFields[kind].some((key) => draft.form[key] !== saved[key]);
  const staleSavedProfile = Boolean(data && draft && data.profileVersion !== draft.profile.version);
  const canSubmit = data && ["DRAFT", "ACTION_REQUIRED", "UNABLE_TO_VERIFY"].includes(data.record.status);
  async function submit(event) {
    event.preventDefault();
    if (locked.current || !draft || !canSubmit || dirtyHistory || staleSavedProfile || draft?.busy) return;
    if (!files.length) { setError(new Error("Choose at least one supporting document.")); return; }
    locked.current = true; setBusy(true); setError(null);
    setProfileDraft((previous) => previous ? { ...previous, busy: true } : previous);
    try {
      const evidenceIds = [];
      for (const file of files) {
        let asset = uploaded.current.get(file);
        if (!asset || asset.revision !== data.record.revision) {
          const result = await credentialsApi.upload(kind, recordId, data.record.revision, file);
          asset = { ...result, revision: data.record.revision }; uploaded.current.set(file, asset);
        }
        evidenceIds.push(asset.id);
      }
      const result = await credentialsApi.submit(kind, recordId, { expectedVersion: data.profileVersion, revision: data.record.revision, evidenceIds });
      setProfileDraft((previous) => rebaseCredentialProfile(previous, result.profile));
      setFiles([]); uploaded.current.clear();
      setData(await credentialsApi.owner(kind, recordId));
    } catch (e) {
      if ([400, 409].includes(e.status)) uploaded.current.clear();
      setError(e);
    } finally {
      locked.current = false; setBusy(false);
      setProfileDraft((previous) => previous ? { ...previous, busy: false } : previous);
    }
  }
  if (!validKind) return <p role="alert">Credential record not found.</p>;
  return <section className="bw-profile-card bw-credentials">
    <Link to="/profile">Back to profile</Link>
    <h1>{kind === "education" ? "Education" : "Experience"} verification</h1>
    <p>Review the saved record, then submit private supporting evidence. Credential review does not automatically verify your individual identity.</p>
    {error && <div role="alert"><p>{error.message}</p><button type="button" disabled={busy} onClick={reload}>Reload saved review</button></div>}
    {!data ? !error && <p role="status">Loading saved record…</p> : <>
      <h2>{data.record.qualification || data.record.role}</h2>
      <p>{data.record.institution || data.record.organization}</p>
      <p>{data.record.startMonth} – {data.record.current ? "Present" : data.record.endMonth}</p>
      <p>Status: {credentialLabels[data.record.status]}</p>
      {data.record.description && <p>{data.record.description}</p>}
      {staleSavedProfile && <div role="alert"><p>Your saved profile changed. Load the latest profile before submitting this record.</p><button type="button" disabled={busy || draft?.busy} onClick={async () => {
        if (locked.current) return;
        const dirty = JSON.stringify(draft.form) !== JSON.stringify(formFromProfile(draft.profile));
        if (dirty && !window.confirm("Discard unsaved profile edits and load the latest saved profile?")) return;
        locked.current = true; setBusy(true); setError(null);
        try { await reloadProfile(); setData(await credentialsApi.owner(kind, recordId)); } catch (e) { setError(e); }
        finally { locked.current = false; setBusy(false); }
      }}>Load latest profile</button></div>}
      {dirtyHistory && <p role="status">You have unsaved {kind} edits. Save or discard them on your profile before submitting this record.</p>}
      {canSubmit && <form onSubmit={submit}>
        <fieldset disabled={!draft || busy || draft?.busy || dirtyHistory || staleSavedProfile}>
          <label htmlFor="credential-documents">Supporting documents</label>
          <input id="credential-documents" type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => {
            const selected = [...(e.target.files || [])];
            if (selected.length > 3 || selected.some((f) => !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(f.type) || f.size > 5 * 1024 * 1024 || f.size === 0)) {
              setError(new Error("Choose up to three JPEG, PNG, WebP or PDF files, each up to 5 MiB.")); e.target.value = ""; setFiles([]); return;
            }
            setFiles(selected); setError(null);
          }} />
          <small>At least one document is required. Up to three files, each up to 5 MiB. PDFs must be readable, static and no more than 100 pages. Evidence is private and available to you and the assigned reviewer.</small>
          {files.map((f, index) => <p key={index}>{f.name}</p>)}
          <button className="bw-profile-button" disabled={!files.length || error?.status === 409} type="submit">{busy ? "Submitting…" : data.review ? "Resubmit for verification" : "Submit for verification"}</button>
        </fieldset>
      </form>}
      {data.review && <CredentialTimeline review={data.review} onError={setError} />}
    </>}
  </section>;
}
