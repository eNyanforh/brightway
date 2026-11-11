import { useCallback, useEffect, useRef, useState } from "react";
import { opportunitiesApi as api } from "../../api/opportunities";
import { APPLICATION_STATUSES } from "../../../../shared/opportunities.mjs";
import ApplicationQuestions from "./ApplicationQuestions";
import ApplicationHistory from "./ApplicationHistory";
import "./opportunities.css";
const transitions = { SUBMITTED: ["UNDER_REVIEW", "SHORTLISTED", "SELECTED", "NOT_SELECTED"], UNDER_REVIEW: ["SHORTLISTED", "SELECTED", "NOT_SELECTED"], SHORTLISTED: ["UNDER_REVIEW", "SELECTED", "NOT_SELECTED"] };
export default function OrganizationApplications({ organization, disabled = false }) {
  const [filter, setFilter] = useState("");
  return <section className="bw-op-workspace"><header className="bw-op-workspace-heading"><div><p className="bw-op-eyebrow">APPLICANT WORKSPACE</p><h2>Applications</h2><p>Review private responses and keep applicants informed.</p></div><label>Status<select value={filter} onChange={e => setFilter(e.target.value)}><option value="">All submissions</option>{Object.entries(APPLICATION_STATUSES).filter(([s]) => s !== "DRAFT").map(([s, label]) => <option key={s} value={s}>{label}</option>)}</select></label></header><ReviewQueue key={organization.id + filter} organization={organization} filter={filter} disabled={disabled} /></section>;
}
function ReviewQueue({ organization, filter, disabled }) {
  const [page, setPage] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false), [app, setApp] = useState(null), [feedback, setFeedback] = useState(""), [decision, setDecision] = useState("");
  const request = useRef(null), lock = useRef(false);
  const load = useCallback(async (cursor) => { if (lock.current) return; lock.current = true; setBusy(true); const c = new AbortController(); request.current?.abort(); request.current = c;
    try { const data = await api.reviews(organization.id, { status: filter, cursor }, c.signal); if (!c.signal.aborted) { setPage(old => cursor && old ? { ...data, items: [...old.items, ...data.items] } : data); setError(null); } }
    catch (e) { if (!c.signal.aborted) { setError(e); if ([401, 403, 404].includes(e.status)) { setApp(null); setPage(null); } } }
    finally { if (!c.signal.aborted) { lock.current = false; setBusy(false); } }
  }, [organization.id, filter]);
  useEffect(() => { let active = true; queueMicrotask(() => { if (active) void load(); }); return () => { active = false; request.current?.abort(); }; }, [load]);
  async function perform(work, success) {
    if (lock.current) return; lock.current = true; setBusy(true); const c = new AbortController(); request.current = c;
    try { const result = await work(c.signal); if (!c.signal.aborted) { setError(null); success(result); } }
    catch (e) { if (!c.signal.aborted) { setError(e); if ([401, 403, 404].includes(e.status)) { setApp(null); setPage(null); } } }
    finally { if (!c.signal.aborted) { lock.current = false; setBusy(false); } }
  }
  const blocked = disabled || busy || Boolean(error);
  return <>
    {error && <div className="bw-op-feedback" role="alert"><p>{error.message}</p><button type="button" disabled={busy} onClick={() => { setApp(null); setFeedback(""); void load(); }}>Reload application queue</button></div>}
    {!page && !error && <p role="status">Loading applications…</p>}
    {!app && page?.items.length === 0 && <div className="bw-op-empty"><h3>No applications here yet</h3><p>Submitted applications matching this status will appear here.</p></div>}
    {!app && <div className="bw-op-review-list">{page?.items.map(row => <button type="button" className="bw-op-application-row" key={row.id} disabled={blocked} onClick={() => void perform(signal => api.review(organization.id, row.id, signal), data => { setApp(data); setFeedback(""); setDecision(""); })}><div><h3>{row.profileSnapshot?.name}</h3><p>{row.opportunitySnapshot?.title}</p><span>{new Date(row.submittedAt).toLocaleString("en-GB")}</span></div><span className={`bw-op-status bw-op-status-${row.status.toLowerCase()}`}>{APPLICATION_STATUSES[row.status]}</span></button>)}</div>}
    {!app && page?.nextCursor && <button type="button" className="bw-op-secondary" disabled={busy} onClick={() => void load(page.nextCursor)}>More applications</button>}
    {app && <section className="bw-op-review-detail"><button className="bw-op-text-button" type="button" disabled={busy} onClick={() => { setApp(null); setFeedback(""); }}>← Back to applications</button><div className="bw-op-section-title"><h3>{app.profileSnapshot?.name}</h3><span className="bw-op-status">{APPLICATION_STATUSES[app.status]}</span></div><p>{app.profileSnapshot?.headline}</p><p>Applying for <strong>{app.opportunitySnapshot?.title}</strong></p>
      <section className="bw-op-surface"><h3>Professional profile at submission</h3><p>{[app.profileSnapshot?.location?.locality, app.profileSnapshot?.location?.countryCode].filter(Boolean).join(", ")}</p><p>Skills: {app.profileSnapshot?.skills?.join(", ")}</p><p>Interests: {app.profileSnapshot?.interests?.join(", ")}</p>{app.profileSnapshot?.credentials?.map(c => <p key={c.id}>{c.title} · {c.organization} · Verified by {c.verifiedBy}</p>)}</section>
      <ApplicationQuestions readOnly questions={app.opportunitySnapshot?.questions || []} answers={app.answers} files={app.files} applicationId={app.id} organizationId={organization.id} />
      <ApplicationHistory events={app.events} />
      {app.canReview && transitions[app.status] ? <form className="bw-op-surface" onSubmit={e => { e.preventDefault(); void perform(signal => api.decide(organization.id, app.id, { expectedVersion: app.version, status: decision, feedback }, signal), data => { setApp(data); setFeedback(""); setDecision(""); setPage(old => ({ ...old, items: old.items.map(row => row.id === data.id ? data : row).filter(row => !filter || row.status === filter) })); }); }}><h3>Update application status</h3><label>Decision<select required value={decision} disabled={blocked} onChange={e => setDecision(e.target.value)}><option value="">Choose a status</option>{transitions[app.status].map(s => <option key={s} value={s}>{APPLICATION_STATUSES[s]}</option>)}</select></label><label>Message to applicant<textarea rows={4} maxLength={1000} disabled={blocked} value={feedback} onChange={e => setFeedback(e.target.value)} placeholder="This message will be visible to the applicant." /></label><button className="bw-op-primary" type="submit" disabled={blocked || !decision}>{busy ? "Saving…" : "Save decision"}</button></form> : <p>{app.canReview ? "This application has reached a final status." : "Another authorized staff member must review your application."}</p>}
    </section>}
  </>;
}
