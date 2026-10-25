import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { manualIdentityApi as api } from "../api/manual-identity";
import ManualIdentityHistory from "../components/profile/ManualIdentityHistory";
import { identityDate, identityLabels } from "./manual-identity-format";
import "./manual-identity.css";
export default function ManualIdentityReviewsPage() {
  const { account } = useAuth();
  const [queue, setQueue] = useState(null), [detail, setDetail] = useState(null), [busy, setBusy] = useState(false);
  const [error, setError] = useState(null), [status, setStatus] = useState("ACTION_REQUIRED"), [note, setNote] = useState("");
  const [reloadRequired, setReloadRequired] = useState(false), [notice, setNotice] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    api.access(controller.signal).then(() => api.queue(null, controller.signal)).then(setQueue).catch((e) => { if (e.name !== "AbortError") setError(e); });
    return () => controller.abort();
  }, []);
  async function action(fn) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null); setNotice("");
    try { await fn(); } catch (e) {
      setError(e); setReloadRequired(true);
      if ([401, 403].includes(e.status)) { setQueue(null); setDetail(null); setNote(""); }
    } finally { lock.current = false; setBusy(false); }
  }
  const attempt = detail?.attempts.find((a) => a.id === detail.request.currentAttemptId);
  const canDecide = !reloadRequired && detail?.status === "IN_REVIEW" && attempt?.reviewerId === account.id;
  async function reload() {
    await action(async () => { await api.access(); const nextQueue = await api.queue();
      const nextDetail = detail ? await api.detail(detail.request.id) : null;
      setQueue(nextQueue); setDetail(nextDetail); setReloadRequired(false); });
  }
  return <section className="bw-profile-card bw-identity">
    <Link to="/manual-identity">Back to identity verification</Link><h1>Identity review workspace</h1>
    <p>Only authorized BrightWay reviewers with two-factor authentication may use this workspace. You cannot review your own request. Review within five working days.</p>
    {error && <p role="alert">{error.message}</p>}{notice && <p role="status">{notice}</p>}
    {[401, 403].includes(error?.status) && <p><Link to="/security">Open Account security</Link>. An active identity-review permission is also required. Sign in with your authenticator or backup code if prompted.</p>}
    <button type="button" disabled={busy} onClick={reload}>Reload identity reviews</button>
    {reloadRequired && <p>Reload before making a decision. Any unsaved feedback stays here unless access has been revoked.</p>}
    {!queue && !error && <p role="status">Checking reviewer access…</p>}
    {queue && <><h2>Requests</h2>{!queue.requests.length && <p>No identity requests yet.</p>}
      <p className="bw-identity-muted">Queue statuses are saved states. Open a request to check its current eligibility and validity.</p>
      <ul className="bw-identity-queue">{queue.requests.map((item) => <li key={item.id}><button type="button" disabled={busy} onClick={() => action(async () => {
        setDetail(null); setDetail(await api.detail(item.id)); setNote(""); setStatus("ACTION_REQUIRED"); setReloadRequired(false);
      })}>Request {item.id.slice(0, 8)} · {identityLabels[item.state] || item.state} · target {identityDate(item.targetAt)}</button></li>)}</ul>
      {queue.nextCursor && <button type="button" disabled={busy} onClick={() => action(async () => setQueue(await api.queue(queue.nextCursor)))}>Next page</button>}
    </>}
    {detail && <div><h2>Review for @{detail.username}</h2>
      <p>Current status: <strong>{identityLabels[detail.status] || detail.status}</strong> · Request version {detail.request.version}</p>
      <p>Review target {identityDate(detail.request.targetAt)}{detail.request.overdue && " · Past review target"}</p>
      {["INVALIDATED", "EXPIRED"].includes(detail.status) && <p>This request cannot be approved. The owner must submit fresh evidence.</p>}
      {detail.status === "SUBMITTED" && <button type="button" disabled={busy || reloadRequired} onClick={() => action(async () => {
        await api.assign(detail.request.id, detail.request.version); setReloadRequired(true);
        const next = await api.detail(detail.request.id); const nextQueue = await api.queue(); setDetail(next); setQueue(nextQueue); setReloadRequired(false);
      })}>Assign to me and start identity review</button>}
      {detail.status === "IN_REVIEW" && !canDecide && !reloadRequired && <p>This request is assigned to another reviewer.</p>}
      {canDecide && <form onSubmit={(event) => { event.preventDefault(); if (!canDecide || note.trim().length < 10) return;
        action(async () => {
          setReloadRequired(true);
          await api.decide(detail.request.id, { expectedVersion: detail.request.version, attemptId: attempt.id, status, note: note.trim() });
          setNotice("Identity review decision saved.");
          const next = await api.detail(detail.request.id); const nextQueue = await api.queue(); setDetail(next); setQueue(nextQueue); setNote(""); setReloadRequired(false);
        });
      }}><fieldset disabled={busy}>
        <label htmlFor="identity-decision">Identity decision</label>
        <select id="identity-decision" value={status} onChange={(e) => setStatus(e.target.value)}>{["ACTION_REQUIRED", "APPROVED", "DECLINED"].map((value) => <option key={value} value={value}>{identityLabels[value]}</option>)}</select>
        <label htmlFor="identity-note">Feedback shown to the user</label><textarea id="identity-note" value={note} required minLength={10} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
        <p>Explain the decision clearly. Avoid copying ID numbers or other sensitive document details into feedback.</p>
        <button className="bw-profile-button" type="submit" disabled={busy || note.trim().length < 10}>Save identity decision</button>
      </fieldset></form>}
      <ManualIdentityHistory attempts={detail.attempts} busy={busy} onDownload={(id) => action(() => api.download(id))} />
    </div>}
  </section>;
}
