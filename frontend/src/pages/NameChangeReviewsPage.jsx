import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { nameChangesApi as api } from "../api/name-changes";
import { identityDate, imageLabels } from "./manual-identity-format";
import "./manual-identity.css";

export default function NameChangeReviewsPage() {
  const { account } = useAuth(), actor = account?.id;
  const [view, setView] = useState(null), [detail, setDetail] = useState(null), [images, setImages] = useState(null), [feedback, setFeedback] = useState(null);
  const [error, setError] = useState(null), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [reloadRequired, setReloadRequired] = useState(false);
  const life = useRef(null), sequence = useRef(0), lock = useRef(false), selected = useRef(null);
  useEffect(() => {
    const current = { active: true }; life.current = current; lock.current = false; selected.current = null; let controller;
    async function load() {
      if (lock.current) return; controller?.abort(); controller = new AbortController(); const generation = ++sequence.current;
      try {
        const queue = await api.queue(null, controller.signal), next = selected.current ? await api.detail(selected.current, controller.signal) : null;
        if (current.active && generation === sequence.current && !controller.signal.aborted) { setView({ actor, queue }); setDetail(next); setReloadRequired(false); setBusy(false); setError(null); }
      } catch (e) { if (current.active && generation === sequence.current && e.name !== "AbortError") { setError(e); setReloadRequired(true); setBusy(false); if ([401, 403].includes(e.status)) { setView(null); setDetail(null); setImages(null); setFeedback(null); selected.current = null; } } }
    }
    void load(); window.addEventListener("focus", load);
    return () => { current.active = false; controller?.abort(); window.removeEventListener("focus", load); };
  }, [actor]);
  const visible = view?.actor === actor ? detail : null, requestId = visible?.id, imageIds = visible?.evidence.map(e => e.id).join(",") || "";
  const available = visible?.evidenceAvailable === true && visible.reviewerId === actor;
  useEffect(() => {
    if (!available || !requestId || reloadRequired) return;
    const controller = new AbortController(), urls = []; let disposed = false;
    Promise.all([{ id: "current-portrait", work: api.portrait(requestId, controller.signal) }, ...imageIds.split(",").filter(Boolean).map(id => ({ id, work: api.image(requestId, id, controller.signal) }))].map(async item => ({ id: item.id, blob: await item.work }))).then(rows => {
      if (disposed) return;
      if (rows.length !== 3) throw Error("Required identity evidence is incomplete. Reload before reviewing.");
      const values = rows.map(row => { const url = URL.createObjectURL(row.blob); urls.push(url); return { id: row.id, url }; });
      setImages({ actor, requestId, values });
    }).catch(e => { if (!disposed && e.name !== "AbortError") { setError(e); setReloadRequired(true); setImages(null); if ([401, 403].includes(e.status)) { setView(null); setDetail(null); setFeedback(null); selected.current = null; } } });
    return () => { disposed = true; controller.abort(); urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [actor, available, requestId, imageIds, reloadRequired]);
  async function action(work) {
    if (lock.current) return; const current = life.current, generation = ++sequence.current;
    const alive = () => current?.active && life.current === current && generation === sequence.current;
    lock.current = true; setBusy(true); setError(null); setNotice("");
    try { await work(alive); }
    catch (e) { if (alive()) { setError(e); setReloadRequired(true); setImages(null); if ([401, 403].includes(e.status)) { setView(null); setDetail(null); setFeedback(null); selected.current = null; } } }
    finally { if (alive()) { lock.current = false; setBusy(false); } }
  }
  async function reload(alive) {
    const queue = await api.queue(), next = selected.current ? await api.detail(selected.current) : null;
    if (alive()) { setView({ actor, queue }); setDetail(next); setReloadRequired(false); }
  }
  const queue = view?.actor === actor ? view.queue : null, draft = feedback?.actor === actor ? feedback : { note: "", decision: "DECLINED", confirmed: false };
  const update = values => setFeedback(old => ({ actor, ...(old?.actor === actor ? old : { note: "", decision: "DECLINED", confirmed: false }), ...values }));
  const imageReady = images?.actor === actor && images.requestId === requestId && images.values.length === 3;
  const canDecide = visible?.state === "IN_REVIEW" && available && imageReady && !reloadRequired && !visible.stale;
  return <section className="bw-profile-card bw-identity">
    <Link to="/admin/manual-identity">Identity review workspace</Link><h1>Name-correction reviews</h1>
    <p>Compare the current approved portrait, fresh government-issued ID and selfie to confirm the same person and proposed name. Only an assigned identity reviewer with MFA can decide. You cannot review your own request.</p>
    {error && <p role="alert">{error.message}</p>}{notice && <p role="status">{notice}</p>}
    <button type="button" disabled={busy} onClick={() => action(reload)}>Reload name reviews</button>
    {reloadRequired && <p>Reload before another decision. Your feedback is retained unless access was revoked.</p>}
    {!queue && !error && <p role="status">Checking reviewer access…</p>}
    {queue && <><h2>Pending name corrections</h2>{!queue.requests.length && <p>No pending name corrections.</p>}
      <ul className="bw-identity-queue">{queue.requests.map(row => <li key={row.id}><button type="button" disabled={busy} onClick={() => action(async alive => {
        selected.current = row.id; setDetail(null); setImages(null); const next = await api.detail(row.id);
        if (alive()) { setDetail(next); setReloadRequired(false); setFeedback({ actor, note: "", decision: "DECLINED", confirmed: false }); }
      })}>Name request {row.id.slice(0, 8)} · {row.state === "SUBMITTED" ? "Waiting for review" : "In review"} · {identityDate(row.targetAt)}</button></li>)}</ul>
      {queue.nextCursor && <button type="button" disabled={busy} onClick={() => action(async alive => { const next = await api.queue(queue.nextCursor); if (alive()) setView({ actor, queue: next }); })}>Next name requests</button>}
    </>}
    {visible && <article><h2>Request from @{visible.username}</h2><p>State: {visible.state.replaceAll("_", " ")}</p>
      {visible.stale && <p>The saved identity or eligibility changed. The owner must cancel this request and use the current identity-verification flow.</p>}
      {visible.state === "SUBMITTED" && <button type="button" disabled={busy || reloadRequired || visible.stale} onClick={() => action(async alive => {
        await api.assign(visible.id, visible.version); if (!alive()) return; setReloadRequired(true);
        const next = await api.detail(visible.id); if (alive()) { setDetail(next); setReloadRequired(false);
          setView(old => old?.actor === actor ? { ...old, queue: { ...old.queue, requests: old.queue.requests.map(row => row.id === next.id ? { ...row, state: next.state, version: next.version } : row) } } : old);
        }
      })}>Assign name correction to me</button>}
      {visible.reviewerId && visible.reviewerId !== actor && <p>This request is assigned to another reviewer.</p>}
      {available && <><h3>Saved name</h3><p>{visible.previousName && Object.values(visible.previousName).filter(Boolean).join(" ")}</p>
        <h3>Proposed name</h3><p>{visible.proposedName && Object.values(visible.proposedName).filter(Boolean).join(" ")}</p><p>Owner’s reason: {visible.reason}</p>
        {!reloadRequired && (imageReady ? <div className="bw-photo-review-comparison"><figure><img src={images.values.find(i => i.id === "current-portrait")?.url} alt="Current approved portrait for name correction" /><figcaption>Current approved portrait</figcaption></figure>{visible.evidence.map(asset => <figure key={asset.id}><img src={images.values.find(i => i.id === asset.id)?.url} alt={`Private ${imageLabels[asset.kind]} for name correction`} /><figcaption>{imageLabels[asset.kind]}</figcaption></figure>)}</div> : <p role="status">Loading private evidence…</p>)}
      </>}
      {canDecide && <form onSubmit={e => { e.preventDefault(); if (!canDecide || !draft.confirmed || draft.note.trim().length < 10) return;
        action(async alive => { setReloadRequired(true); await api.decide(visible.id, { expectedVersion: visible.version, expectedProfileVersion: visible.profileVersion, decision: draft.decision, note: draft.note.trim() });
          if (!alive()) return; setNotice("Name-correction decision saved."); setDetail(null); setImages(null); setFeedback(null); selected.current = null;
          const next = await api.queue(); if (alive()) { setView({ actor, queue: next }); setReloadRequired(false); }
        });
      }}><fieldset disabled={busy}><legend>Review decision</legend>
        <label htmlFor="name-review-decision">Name decision</label><select id="name-review-decision" value={draft.decision} onChange={e => update({ decision: e.target.value })}><option value="DECLINED">Decline</option><option value="APPROVED">Approve</option></select>
        <label htmlFor="name-review-note">Feedback shown to the owner</label><textarea id="name-review-note" required minLength={10} maxLength={2000} value={draft.note} onChange={e => update({ note: e.target.value })} />
        <label className="bw-identity-consent"><input type="checkbox" checked={draft.confirmed} onChange={e => update({ confirmed: e.target.checked })} />I compared the approved portrait, both documents and the proposed name.</label>
        <button type="submit" className="bw-profile-button" disabled={busy || !draft.confirmed || draft.note.trim().length < 10}>Save name decision</button>
      </fieldset></form>}
    </article>}
  </section>;
}
