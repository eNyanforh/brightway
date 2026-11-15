import { useEffect, useRef, useState } from "react";
import { opportunitiesApi as api } from "../../api/opportunities";
import { useAuth } from "../../auth/useAuth";
import OpportunityCard from "./OpportunityCard";
import ChallengeSidebarCard from "./ChallengeSidebarCard";

// Compact discovery surfaces prioritize variety without breaking newest-first order.
function compactSelection(items, max = 4) {
  const firstOfType = new Set();
  const selection = new Set();
  for (const item of items) {
    if (firstOfType.has(item.type)) continue;
    firstOfType.add(item.type);
    selection.add(item.id);
    if (selection.size === max) break;
  }
  for (const item of items) {
    if (selection.size === max) break;
    selection.add(item.id);
  }
  return items.filter(item => selection.has(item.id));
}
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
    {page?.items.length === 0 && <div className="bw-op-empty"><h2>{type === "CHALLENGE" ? "No open challenges" : "No open opportunities"}</h2><p>{type === "CHALLENGE" ? "New challenges will appear here when verified publishers announce them." : "Check back for new opportunities from verified organizations."}</p></div>}
    {page?.items.length > 0 && <div className={compact ? "bw-op-grid bw-op-grid-compact bw-rail-opportunity-list" : "bw-op-grid"}>
      {(compact ? compactSelection(page.items) : page.items).map(o => compact && o.type === "CHALLENGE"
        ? <ChallengeSidebarCard key={o.id} opportunity={o} />
        : <OpportunityCard key={o.id} opportunity={o} />)}
    </div>}
    {!compact && page?.nextCursor && <button className="bw-op-secondary" type="button" disabled={busy} onClick={() => void more()}>{busy ? "Loading…" : "More opportunities"}</button>}
  </section>;
}
