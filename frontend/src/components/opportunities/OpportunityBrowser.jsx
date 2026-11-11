import { useEffect, useRef, useState } from "react";
import { opportunitiesApi as api } from "../../api/opportunities";
import { useAuth } from "../../auth/useAuth";
import OpportunityCard from "./OpportunityCard";
export default function OpportunityBrowser({ q = "", type = "", following = false, compact = false }) {
  const { account } = useAuth();
  const [attempt, setAttempt] = useState(0);
  return <Browser key={JSON.stringify([account?.id, q, type, following, attempt])} q={q} type={type} following={following} compact={compact} onRetry={() => setAttempt(value => value + 1)} />;
}
function Browser({ q, type, following, compact, onRetry }) {
  const [page, setPage] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false);
  const current = useRef(null);
  useEffect(() => {
    const controller = new AbortController(); current.current = controller;
    api.browse({ q, type, ...(following ? { following: "true" } : {}) }, controller.signal).then(data => { if (!controller.signal.aborted) setPage(data); }).catch(e => { if (!controller.signal.aborted) setError(e); });
    return () => { controller.abort(); current.current?.abort(); };
  }, [q, type, following]);
  async function more() {
    if (busy) return;
    const controller = new AbortController(); current.current = controller; setBusy(true);
    try { const data = await api.browse({ q, type, ...(following ? { following: "true" } : {}), cursor: page.nextCursor }, controller.signal);
      if (!controller.signal.aborted) { setPage(old => ({ ...data, items: [...old.items, ...data.items.filter(item => !old.items.some(o => o.id === item.id))] })); setError(null); } }
    catch (e) { if (!controller.signal.aborted) setError(e); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <section className="bw-op-results" aria-label="Opportunity results">
    {error && <p role="alert">{error.message} <button type="button" onClick={onRetry}>Reload opportunities</button></p>}
    {!page && !error && <p role="status">Finding opportunities…</p>}
    {page?.items.length === 0 && <div className="bw-op-empty"><h2>No opportunities found</h2><p>Try another search or check back for new listings from verified organizations.</p></div>}
    {page?.items.length > 0 && <div className={"bw-op-grid" + (compact ? " bw-op-grid-compact" : "")}>{(compact ? page.items.slice(0, 2) : page.items).map(o => <OpportunityCard key={o.id} opportunity={o} />)}</div>}
    {!compact && page?.nextCursor && <button className="bw-op-secondary" type="button" disabled={busy} onClick={() => void more()}>{busy ? "Loading…" : "More opportunities"}</button>}
  </section>;
}
