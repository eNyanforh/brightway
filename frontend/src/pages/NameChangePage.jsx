import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { nameChangesApi as api } from "../api/name-changes";
import { manualIdentityApi } from "../api/manual-identity";
import { identityDate, imageLabels } from "./manual-identity-format";
import "./manual-identity.css";

const empty = { firstName: "", middleName: "", lastName: "", reason: "", password: "" };
export default function NameChangePage() {
  const { account, refresh } = useAuth(), actor = account?.id;
  const [view, setView] = useState(null), [draft, setDraft] = useState(null), [error, setError] = useState(null), [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false), [reloadRequired, setReloadRequired] = useState(false), [consent, setConsent] = useState(false);
  const [files, setFiles] = useState({}), [chosen, setChosen] = useState({}), [retryPending, setRetryPending] = useState(false);
  const lock = useRef(false), life = useRef(null), retry = useRef(null), inputs = useRef({});
  const data = view?.actor === actor ? view.data : null, values = draft?.actor === actor ? draft.values : empty;
  const change = (key, value) => setDraft(old => ({ actor, dirty: true, values: { ...(old?.actor === actor ? old.values : empty), [key]: value } }));
  useEffect(() => {
    const current = { active: true }; life.current = current; const controller = new AbortController(); lock.current = false; retry.current = null;
    Promise.all([api.owner(controller.signal), manualIdentityApi.evidence(controller.signal)]).then(([next, assets]) => {
      if (!current.active) return;
      setView({ actor, data: next, assets }); setDraft({ actor, dirty: false, values: { ...empty, ...next.currentName, middleName: next.currentName.middleName || "" } });
      setFiles({}); setChosen({}); setConsent(false); setRetryPending(false); setBusy(false); setReloadRequired(false); setError(null); setNotice("");
    }).catch(e => { if (current.active && e.name !== "AbortError") { setError(e); setReloadRequired(true); setBusy(false); } });
    return () => { current.active = false; controller.abort(); retry.current = null; };
  }, [actor]);
  useEffect(() => {
    if (!busy && !retryPending && !draft?.dirty && !Object.values(files).some(Boolean)) return;
    const warn = e => { e.preventDefault(); e.returnValue = ""; }; window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy, retryPending, draft, files]);
  async function action(work) {
    if (lock.current) return; const current = life.current; const alive = () => current?.active && life.current === current;
    lock.current = true; setBusy(true); setError(null); setNotice("");
    try { await work(alive); }
    catch (e) { if (alive()) { setError(e); if ([401, 403, 409].includes(e.status)) setReloadRequired(true); if ([400, 401, 403, 409, 429].includes(e.status)) { retry.current = null; setRetryPending(false); change("password", ""); } if ([401, 403].includes(e.status)) { setView(null); setFiles({}); setChosen({}); setDraft(null); } } }
    finally { if (alive()) { lock.current = false; setBusy(false); } }
  }
  async function reload(alive) {
    const [next, assets] = await Promise.all([api.owner(), manualIdentityApi.evidence()]); if (!alive()) return;
    setView({ actor, data: next, assets }); setReloadRequired(false); retry.current = null; setRetryPending(false);
    setChosen(old => Object.fromEntries(Object.entries(old).filter(([, id]) => assets.some(a => a.id === id))));
    setDraft(old => old?.actor === actor && old.dirty ? { ...old, values: { ...old.values, password: "" } } : { actor, dirty: false, values: { ...empty, ...next.currentName, middleName: next.currentName.middleName || "" } });
    await refresh();
  }
  const frozen = busy || reloadRequired || retryPending;
  async function upload(kind) {
    const file = files[kind]; if (!consent || frozen || !data?.canRequest || !file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) { setError(Error("Choose a JPEG, PNG or WebP image up to 5 MiB.")); return; }
    await action(async alive => { const asset = await manualIdentityApi.upload(kind, file); if (!alive()) return;
      setView(old => ({ ...old, assets: [asset, ...old.assets] })); setChosen(old => ({ ...old, [kind]: asset.id })); setFiles(old => ({ ...old, [kind]: null })); if (inputs.current[kind]) inputs.current[kind].value = "";
      setNotice(`${imageLabels[kind]} uploaded privately.`);
    });
  }
  async function submit(e) {
    e.preventDefault(); if (!data?.canRequest || busy || reloadRequired || !consent || !chosen.GOVERNMENT_ID || !chosen.SELFIE) return;
    await action(async alive => {
      retry.current ??= { expectedProfileVersion: data.profileVersion, expectedIdentityRevision: data.identityRevision, idempotencyKey: crypto.randomUUID(), password: values.password,
        proposedName: { firstName: values.firstName.trim(), middleName: values.middleName.trim() || null, lastName: values.lastName.trim() }, reason: values.reason.trim(),
        governmentId: chosen.GOVERNMENT_ID, selfie: chosen.SELFIE, consentVersion: data.consentVersion };
      setRetryPending(true); await api.submit(retry.current); if (!alive()) return;
      retry.current = null; setRetryPending(false); setReloadRequired(true); setFiles({}); setChosen({}); setConsent(false); setDraft({ actor, dirty: false, values: empty });
      setNotice("Name correction submitted. Your current name remains until approval. Reload if the status has not refreshed."); await reload(alive);
    });
  }
  return <section className="bw-profile-card bw-identity">
    <Link to="/manual-identity">Back to identity verification</Link><h1>Request a name correction</h1>
    <p>Your saved name changes only after BrightWay reviews a fresh government-issued ID and selfie. Review is within five working days. A correction does not change your date of birth, email or credentials.</p>
    {error && <p role="alert">{error.message}</p>}{notice && <p role="status">{notice}</p>}
    <button type="button" disabled={busy} onClick={() => action(reload)}>Reload name-correction status</button>
    {reloadRequired && <p>Reload before making another change. Keep any local files you need. Selected files and draft details stay only while this page remains open.</p>}
    {!data && !error && <p role="status">Loading name-correction requirements…</p>}
    {data && <><p>Current saved name: <strong>{Object.values(data.currentName).filter(Boolean).join(" ")}</strong></p>
      {!data.identityVerified && <p>A currently verified identity is required. <Link to="/manual-identity">View your identity status</Link>.</p>}
      {data.canRequest && <form onSubmit={submit}>
        <fieldset disabled={frozen}><legend>Proposed name</legend>
          {[["firstName", "First name"], ["middleName", "Middle name (optional)"], ["lastName", "Last name"]].map(([key, label]) => <label key={key} htmlFor={`name-change-${key}`}>{label}<input id={`name-change-${key}`} maxLength={100} required={key !== "middleName"} autoComplete="off" value={values[key] || ""} onChange={e => change(key, e.target.value)} /></label>)}
          <label htmlFor="name-change-reason">Why does your name need correction?</label><textarea id="name-change-reason" required minLength={10} maxLength={1000} value={values.reason} onChange={e => change("reason", e.target.value)} />
          <label htmlFor="name-change-password">Current password</label><input id="name-change-password" type="password" autoComplete="current-password" required maxLength={128} value={values.password} onChange={e => change("password", e.target.value)} />
        </fieldset>
        <p>Submitted documents and the old/proposed name snapshot are retained for 30 days after a decision. Unsubmitted uploads expire after 24 hours. Minimal decision/security audit records are retained separately. Keep this tab open.</p>
        <label className="bw-identity-consent"><input type="checkbox" checked={consent} disabled={frozen} onChange={e => setConsent(e.target.checked)} />I consent to private review of this name correction and its fresh ID/selfie evidence.</label>
        {Object.entries(imageLabels).map(([kind, label]) => <fieldset key={kind} disabled={frozen || !consent}><legend>{label}</legend>
          <label htmlFor={`name-change-file-${kind}`}>Choose {label}</label><input ref={node => { inputs.current[kind] = node; }} id={`name-change-file-${kind}`} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setFiles(old => ({ ...old, [kind]: e.target.files[0] || null }))} />
          <button type="button" disabled={!files[kind]} onClick={() => upload(kind)}>Upload {label}</button>
          <label htmlFor={`name-change-choice-${kind}`}>Uploaded {label}</label><select id={`name-change-choice-${kind}`} value={chosen[kind] || ""} onChange={e => setChosen(old => ({ ...old, [kind]: e.target.value }))}><option value="">Choose a fresh upload</option>{view.assets.filter(a => a.kind === kind).map((a, i) => <option key={a.id} value={a.id}>Upload {i + 1} · {identityDate(a.expiresAt)}</option>)}</select>
        </fieldset>)}
        <button type="submit" className="bw-profile-button" disabled={busy || reloadRequired || !consent || !chosen.GOVERNMENT_ID || !chosen.SELFIE}>{retryPending ? "Retry same name-correction request" : "Submit name correction"}</button>
      </form>}
      <h2>Name-correction history</h2>{!data.requests.length && <p>No name corrections requested.</p>}
      {data.requests.map(row => <article className="bw-identity-attempt" key={row.id}><h3>{row.state.replaceAll("_", " ")}</h3><p>Submitted {identityDate(row.createdAt)} · review target {identityDate(row.targetAt)}</p>
        {row.proposedName && <p>Proposed name: {Object.values(row.proposedName).filter(Boolean).join(" ")}</p>}{row.note && <p>Reviewer feedback: {row.note}</p>}
        {["SUBMITTED", "IN_REVIEW"].includes(row.state) && <button type="button" disabled={busy || reloadRequired} onClick={() => action(async alive => { await api.cancel(row.id, row.version); if (!alive()) return; setNotice("Name correction cancelled. Your saved name is unchanged."); await reload(alive); })}>Cancel name correction</button>}
      </article>)}
    </>}
  </section>;
}
