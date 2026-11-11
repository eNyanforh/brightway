import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { opportunitiesApi as api } from "../../api/opportunities";
import { APPLICATION_STATUSES } from "../../../../shared/opportunities.mjs";
export default function MyApplications() {
  const [page, setPage] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false);
  const request = useRef(null);
  useEffect(() => { const c = new AbortController(); request.current = c;
    api.mine(null, c.signal).then(data => { if (!c.signal.aborted) setPage(data); }).catch(e => { if (!c.signal.aborted) setError(e); });
    return () => request.current?.abort(); }, []);
  async function more() { if (busy) return; const c = new AbortController(); request.current = c; setBusy(true);
    try { const data = await api.mine(page.nextCursor, c.signal); if (!c.signal.aborted) setPage(old => ({ ...data, items: [...old.items, ...data.items] })); }
    catch (e) { if (!c.signal.aborted) setError(e); } finally { if (!c.signal.aborted) setBusy(false); } }
  return <section aria-label="My applications" className="bw-op-applications">
    <h2>Track your next step</h2><p>Your drafts, applications, participation, and registrations in one place.</p>
    {error && <p role="alert">{error.message}</p>}{!page && !error && <p role="status">Loading applications…</p>}
    {page?.items.length === 0 && <div className="bw-op-empty"><h3>Your journey starts here</h3><p>Applications you save or submit will appear here.</p><Link to="/opportunities">Discover opportunities</Link></div>}
    {page?.items.map(app => <Link className="bw-op-application-row" key={app.id} to={`/applications/${app.id}`}><div><span className="bw-op-provider">{app.opportunitySnapshot?.organization || app.opportunity.organization.name}</span><h3>{app.opportunitySnapshot?.title || app.opportunity.title}</h3><span>{app.submittedAt ? `Submitted ${new Date(app.submittedAt).toLocaleDateString("en-GB")}` : "Continue your saved draft"}</span></div><span className={`bw-op-status bw-op-status-${app.status.toLowerCase()}`}>{APPLICATION_STATUSES[app.status]}</span></Link>)}
    {page?.nextCursor && <button type="button" className="bw-op-secondary" disabled={busy} onClick={() => void more()}>More applications</button>}
  </section>;
}
