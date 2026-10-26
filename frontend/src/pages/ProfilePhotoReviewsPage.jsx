import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { profilePhotoReviewsApi as api } from "../api/profile-photo-reviews";
import { identityDate } from "./manual-identity-format";
import "./manual-identity.css";

export default function ProfilePhotoReviewsPage() {
  const { account } = useAuth();
  const [view, setView] = useState(null), [detail, setDetail] = useState(null), [images, setImages] = useState(null);
  const [error, setError] = useState(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [reloadRequired, setReloadRequired] = useState(false), [draft, setDraft] = useState(null);
  const lock = useRef(false), selectedId = useRef(null), revision = useRef(0), lifetime = useRef(null);
  const actor = account?.id;
  const note = draft?.actor === actor ? draft.note : "";
  const decision = draft?.actor === actor ? draft.decision : "DECLINED";
  const updateDraft = (changes) => setDraft((previous) => ({ actor, note: previous?.actor === actor ? previous.note : "", decision: previous?.actor === actor ? previous.decision : "DECLINED", ...changes }));
  useEffect(() => {
    const life = { active: true }; lifetime.current = life; lock.current = false; selectedId.current = null;
    let controller;
    async function load() {
      if (lock.current) return;
      controller?.abort(); controller = new AbortController(); const generation = ++revision.current;
      try {
        const queue = await api.queue(null, controller.signal);
        const selected = selectedId.current ? await api.detail(selectedId.current, controller.signal) : null;
        if (life.active && generation === revision.current && !controller.signal.aborted) { setView({ actor, queue }); setDetail(selected); setError(null); setReloadRequired(false); setBusy(false); }
      } catch (failure) {
        if (life.active && generation === revision.current && failure.name !== "AbortError") {
          setError(failure); setReloadRequired(true); setBusy(false);
          if ([401, 403].includes(failure.status)) { setView(null); setDetail(null); setImages(null); setDraft(null); selectedId.current = null; }
        }
      }
    }
    void load(); window.addEventListener("focus", load);
    return () => { life.active = false; controller?.abort(); window.removeEventListener("focus", load); };
  }, [actor]);
  const visible = view?.actor === actor ? detail : null;
  const visibleId = visible?.id;
  const imagesAvailable = visible?.imagesAvailable === true && visible.reviewerId === actor;
  useEffect(() => {
    if (!imagesAvailable || !visibleId || reloadRequired) return;
    const controller = new AbortController(); let disposed = false; const urls = [];
    Promise.all([api.image(visibleId, "current", controller.signal), api.image(visibleId, "candidate", controller.signal)]).then((blobs) => {
      if (disposed) return;
      blobs.forEach((blob) => urls.push(URL.createObjectURL(blob)));
      setImages({ actor, id: visibleId, current: urls[0], candidate: urls[1] });
    }).catch((failure) => {
      if (!disposed && failure.name !== "AbortError") {
        setError(failure); setReloadRequired(true); setImages(null);
        if ([401, 403].includes(failure.status)) { setView(null); setDetail(null); setDraft(null); selectedId.current = null; }
      }
    });
    return () => { disposed = true; controller.abort(); urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [imagesAvailable, visibleId, reloadRequired, actor]);
  async function action(work) {
    if (lock.current) return;
    const life = lifetime.current, generation = ++revision.current;
    const alive = () => life?.active && lifetime.current === life && revision.current === generation;
    lock.current = true; setBusy(true); setError(null); setNotice("");
    try { await work(alive); }
    catch (failure) {
      if (alive()) {
        setError(failure); setReloadRequired(true); setImages(null);
        if ([401, 403].includes(failure.status)) { setView(null); setDetail(null); setDraft(null); selectedId.current = null; }
      }
    } finally { if (alive()) { lock.current = false; setBusy(false); } }
  }
  async function reload() {
    await action(async (alive) => {
      const queue = await api.queue(); if (!alive()) return; const selected = selectedId.current ? await api.detail(selectedId.current) : null;
      if (!alive()) return;
      setView({ actor, queue }); setDetail(selected); setReloadRequired(false);
    });
  }
  const queue = view?.actor === actor ? view.queue : null;
  const stateLabel = { PENDING: "Waiting for review", IN_REVIEW: "In review", APPROVED: "Approved", DECLINED: "Declined", SUPERSEDED: "Replaced by a newer request", CANCELLED: "Cancelled" };
  const canDecide = visible?.state === "IN_REVIEW" && imagesAvailable && !visible.stale && !reloadRequired && images?.actor === actor && images?.id === visible.id;
  return <section className="bw-profile-card bw-identity">
    <Link to="/admin/manual-identity">Identity review workspace</Link><h1>Profile photo reviews</h1>
    <p>Compare the current portrait and replacement. Confirm that the replacement is an appropriate photo of the same person. You cannot review your own photo.</p>
    {error && <p role="alert">{error.message}</p>}{notice && <p role="status">{notice}</p>}
    <button type="button" disabled={busy} onClick={reload}>Reload photo reviews</button>
    {reloadRequired && <p>Reload before making another decision. Your feedback remains unless access has been revoked.</p>}
    {[401, 403].includes(error?.status) && <p><Link to="/security">Open Account security</Link>. Active identity-review permission and MFA are required.</p>}
    {!queue && !error && <p role="status">Checking photo reviewer access…</p>}
    {queue && <><h2>Pending replacements</h2>{!queue.requests.length && <p>No pending photo requests.</p>}
      <ul className="bw-identity-queue">{queue.requests.map((row) => <li key={row.id}><button type="button" disabled={busy} onClick={() => action(async (alive) => {
        setDetail(null); setImages(null); selectedId.current = row.id;
        const next = await api.detail(row.id); if (alive()) { setDetail(next); setReloadRequired(false); setDraft({ actor, note: "", decision: "DECLINED" }); }
      })}>Photo request {row.id.slice(0, 8)} · {row.state === "PENDING" ? "Waiting for review" : "In review"} · {identityDate(row.createdAt)}</button></li>)}</ul>
      {queue.nextCursor && <button type="button" disabled={busy} onClick={() => action(async (alive) => { const next = await api.queue(queue.nextCursor); if (alive()) setView({ actor, queue: next }); })}>Next photo requests</button>}
    </>}
    {visible && <div><h2>Photo for @{visible.username}</h2>
      <p>Current state: {stateLabel[visible.state] || "Unavailable"}</p>
      {visible.stale && <p>The applicant’s identity or current photo changed. Ask them to cancel this request and submit a new replacement.</p>}
      {visible.state === "PENDING" && <button type="button" disabled={busy || reloadRequired || visible.stale} onClick={() => action(async (alive) => {
        await api.assign(visible.id, visible.version); if (!alive()) return; setReloadRequired(true);
        const next = await api.detail(visible.id); if (alive()) {
          setDetail(next); setReloadRequired(false);
          setView((previous) => previous?.actor === actor ? { ...previous, queue: { ...previous.queue, requests: previous.queue.requests.map((row) => row.id === next.id ? { ...row, state: next.state, version: next.version } : row) } } : previous);
        }
      })}>Assign photo review to me</button>}
      {visible.state === "IN_REVIEW" && visible.reviewerId !== actor && <p>This photo request is assigned to another reviewer.</p>}
      {imagesAvailable && !reloadRequired && (images?.actor === actor && images?.id === visible.id ? <div className="bw-photo-review-comparison">
        <figure><img src={images.current} alt="Current approved profile portrait" /><figcaption>Current approved photo</figcaption></figure>
        <figure><img src={images.candidate} alt="Private replacement profile portrait" /><figcaption>Proposed replacement</figcaption></figure>
      </div> : <p role="status">Loading private comparison images…</p>)}
      {canDecide && <form onSubmit={(event) => { event.preventDefault(); if (!canDecide || note.trim().length < 10) return;
        action(async (alive) => {
          setReloadRequired(true);
          await api.decide(visible.id, { expectedVersion: visible.version, expectedProfileVersion: visible.profileVersion, decision, note: note.trim() });
          if (!alive()) return;
          setNotice("Photo review decision saved."); setDetail(null); setImages(null); selectedId.current = null; setDraft(null);
          const next = await api.queue(); if (alive()) { setView({ actor, queue: next }); setReloadRequired(false); }
        });
      }}><fieldset disabled={busy}>
        <label htmlFor="photo-review-decision">Photo decision</label><select id="photo-review-decision" value={decision} onChange={(e) => updateDraft({ decision: e.target.value })}><option value="DECLINED">Decline</option><option value="APPROVED">Approve</option></select>
        <label htmlFor="photo-review-note">Feedback shown to the user</label><textarea id="photo-review-note" required minLength={10} maxLength={2000} value={note} onChange={(e) => updateDraft({ note: e.target.value })} />
        <button type="submit" className="bw-profile-button" disabled={busy || note.trim().length < 10}>Save photo decision</button>
      </fieldset></form>}
    </div>}
  </section>;
}
