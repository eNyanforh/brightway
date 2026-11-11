import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { learningApi as api } from "../../api/learning";
import { ADMISSION_STATUSES } from "../../../../shared/learning.mjs";
export default function MyApplications() {
  const [page, setPage] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false), [retry, setRetry] = useState(0);
  const request = useRef(null);
  useEffect(() => { const c = new AbortController(); request.current = c;
    api.mine(null, c.signal).then(data => { if (!c.signal.aborted) { setPage(data); setError(null); } }).catch(e => { if (!c.signal.aborted) { setError(e); if ([401, 403, 404].includes(e.status)) setPage(null); } });
    return () => request.current?.abort(); }, [retry]);
  async function more() { if (busy) return; const c = new AbortController(); request.current = c; setBusy(true);
    try { const data = await api.mine(page.nextCursor, c.signal); if (!c.signal.aborted) setPage(old => ({ ...data, items: [...old.items, ...data.items] })); }
    catch (e) { if (!c.signal.aborted) setError(e); } finally { if (!c.signal.aborted) setBusy(false); } }
  return <section aria-label="My applications" className="bw-op-applications">
    <h2>Track your next step</h2><p>Your saved and submitted program applications.</p>
    {error && <div role="alert"><p>{error.message}</p><button type="button" disabled={busy} onClick={() => setRetry(v => v + 1)}>Reload applications</button></div>}{!page && !error && <p role="status">Loading applications…</p>}
    {page?.items.length === 0 && <div className="bw-op-empty"><h3>Your journey starts here</h3><p>Applications you save or submit will appear here.</p><Link to="/learning">Discover programs</Link></div>}
    {page?.items.map(app => <Link className="bw-op-application-row" key={app.id} to={`/learning/applications/${app.id}`}><div><span className="bw-op-provider">{app.cycleSnapshot?.organization || app.cycle.organization.name}</span><h3>{app.cycleSnapshot?.title || app.cycle.title}</h3><span>{app.submittedAt ? `Submitted ${new Date(app.submittedAt).toLocaleDateString("en-GB")}` : "Continue your saved draft"}</span></div><span className={`bw-op-status bw-op-status-${app.status.toLowerCase()}`}>{ADMISSION_STATUSES[app.status]}</span></Link>)}
    {page?.nextCursor && <button type="button" className="bw-op-secondary" disabled={busy} onClick={() => void more()}>More applications</button>}
  </section>;
}
