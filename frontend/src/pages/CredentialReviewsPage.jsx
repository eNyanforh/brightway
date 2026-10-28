import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { credentialsApi } from "../api/credentials";
import { CredentialTimeline } from "../components/profile/CredentialTimeline";
import { credentialLabels } from "./credential-form";
import "./credentials.css";
export default function CredentialReviewsPage() {
  const { account } = useAuth(), { organizationId } = useParams();
  return <ReviewWorkspace key={`${account?.id}:${organizationId || "brightway"}`} accountId={account?.id} organizationId={organizationId} />;
}
function ReviewWorkspace({ accountId, organizationId }) {
  const api = useMemo(() => credentialsApi.inOrganization(organizationId), [organizationId]);
  const setActing = useOutletContext()?.setActingOrganization;
  const [queue, setQueue] = useState(null), [detail, setDetail] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false), [note, setNote] = useState(""), [status, setStatus] = useState("ACTION_REQUIRED");
  const locked = useRef(false), lifetime = useRef(null), selected = useRef(null);
  const failure = useCallback((e) => {
    setError(e);
    if ([401, 403, 404].includes(e.status)) { setQueue(null); setDetail(null); selected.current = null; setNote(""); setActing?.(null); }
  }, [setActing]);
  useEffect(() => {
    const current = { controller: null }; lifetime.current = current;
    async function load(preserve = false) {
      if (locked.current) return;
      current.controller?.abort(); const controller = new AbortController(); current.controller = controller;
      try {
        const next = await api.queue(null, controller.signal);
        if (controller.signal.aborted || lifetime.current !== current) return;
        setQueue(next); setError(null);
        if (organizationId && next.organization) setActing?.({ accountId, organization: next.organization });
        if (preserve && selected.current) {
          const nextDetail = await api.detail(selected.current.id, controller.signal);
          if (controller.signal.aborted || lifetime.current !== current) return;
          if (nextDetail.review.version !== selected.current.version) setError(Object.assign(new Error("This review changed. Reload reviews before continuing. Your reason is still here."), { status: 409 }));
          else setDetail(nextDetail);
        }
      } catch (e) { if (!controller.signal.aborted && lifetime.current === current) failure(e); }
    }
    void load(); const focus = () => void load(true); window.addEventListener("focus", focus);
    return () => { current.controller?.abort(); if (lifetime.current === current) lifetime.current = null; setActing?.(null); window.removeEventListener("focus", focus); };
  }, [accountId, organizationId, api, setActing, failure]);
  async function action(fn) {
    if (locked.current) return;
    locked.current = true; const current = lifetime.current; current?.controller?.abort(); setBusy(true); setError(null);
    const valid = () => lifetime.current === current;
    const show = value => { if (valid()) { setDetail(value); selected.current = value.review; } };
    try { await fn(valid, show); } catch (e) { if (valid()) failure(e); }
    finally { if (valid()) { locked.current = false; setBusy(false); } }
  }
  async function open(id) { setDetail(null); selected.current = null; await action(async (valid, show) => { const next = await api.detail(id); if (valid()) { show(next); setNote(""); } }); }
  const review = detail?.review;
  return <section className="bw-profile-card bw-credentials">
    <Link to={organizationId ? `/organization-workspace/${organizationId}` : "/profile"}>{organizationId ? "Back to organization workspace" : "Back to profile"}</Link>
    <h1>{queue?.organization ? `${queue.organization.name} — credential reviews` : "Credential review workspace"}</h1>
    <p>{organizationId ? "Only claims explicitly submitted to this organization are available here." : "BrightWay reviews claims submitted for unlisted issuers. Listed issuers use their own organization workspace."} These decisions do not grant individual Verified status.</p>
    {error && <p role="alert">{error.message}</p>}
    {error?.status === 403 && <Link to="/security">Open Account security</Link>}
    {!queue && !error && <p role="status">Checking reviewer access…</p>}
    <button type="button" disabled={busy} onClick={() => action(async (valid, show) => { const next = await api.queue(); const latest = review ? await api.detail(review.id) : null; if (valid()) { setQueue(next); if (latest) show(latest); setNote(""); } })}>Reload reviews</button>
    {queue && <>
      {!queue.reviews.length && <p>No credential submissions yet.</p>}
      <ul className="bw-review-queue">{queue.reviews.map((item) => <li key={item.id}>
        <button type="button" disabled={busy} onClick={() => open(item.id)}>{item.profile.person.firstName} {item.profile.person.lastName} · {item.kind} · {credentialLabels[item.status]}{item.overdue ? " · Past review target" : ""}</button>
      </li>)}</ul>
      {queue.nextCursor && <button type="button" disabled={busy} onClick={() => action(async valid => { const next = await api.queue(queue.nextCursor); if (valid()) setQueue(next); })}>Next page</button>}
    </>}
    {review && <div>
      <h2>Review for @{detail.username}</h2>
      <p>Reviewing issuer: {review.issuerName || "BrightWay (unlisted issuer)"}</p>
      <p>{credentialLabels[review.status]} · Revision {review.revision}</p>
      {review.attempts.length > 0 && <dl>{Object.entries(review.attempts.at(-1).snapshot).filter(([key]) => !["id", "revision", "status"].includes(key)).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value === null ? "—" : String(value)}</dd></div>)}</dl>}
      {(review.status === "SUBMITTED" || detail.canReassign) && <button type="button" className="bw-profile-button" disabled={busy || error?.status === 409} onClick={() => action(async (valid, show) => { await api.assign(review.id, review.version); const next = await api.detail(review.id), list = await api.queue(); if (valid()) { show(next); setQueue(list); } })}>{detail.canReassign ? "Reassign withdrawn review to me" : "Assign to me and start review"}</button>}
      {review.status === "IN_REVIEW" && review.reviewerId === accountId && <form onSubmit={(event) => {
        event.preventDefault();
        if (error?.status === 409) return;
        action(async (valid, show) => {
          await api.decide(review.id, { expectedVersion: review.version, revision: review.revision, status, note });
          const next = await api.detail(review.id), list = await api.queue(); if (valid()) { show(next); setQueue(list); setNote(""); }
        });
      }}><fieldset disabled={busy}>
        <label htmlFor="credential-decision">Decision</label>
        <select id="credential-decision" value={status} onChange={(e) => setStatus(e.target.value)}>{["ACTION_REQUIRED", "VERIFIED", "UNABLE_TO_VERIFY", "FALSE_CREDENTIAL"].map((value) => <option key={value} value={value}>{credentialLabels[value]}</option>)}</select>
        <label htmlFor="credential-reason">Reason shown to the user</label>
        <textarea id="credential-reason" required minLength={10} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="bw-profile-button" disabled={busy || note.trim().length < 10 || error?.status === 409} type="submit">{busy ? "Saving decision…" : "Save review decision"}</button>
      </fieldset></form>}
      <CredentialTimeline review={review} onError={failure} allowDownload={review.reviewerId === accountId && error?.status !== 409} />
    </div>}
  </section>;
}
