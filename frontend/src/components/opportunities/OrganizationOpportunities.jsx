import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { opportunitiesApi as api } from "../../api/opportunities";
import { OPPORTUNITY_TYPES, OPPORTUNITY_STATUSES } from "../../../../shared/opportunities.mjs";
import OpportunityEditor from "./OpportunityEditor";
import "./opportunities.css";
const transitions = { DRAFT: ["PUBLISHED", "CANCELLED", "REMOVED"], PUBLISHED: ["PAUSED", "CLOSED", "CANCELLED", "REMOVED"], PAUSED: ["PUBLISHED", "CLOSED", "CANCELLED", "REMOVED"], CLOSED: ["REMOVED"], CANCELLED: ["REMOVED"], REMOVED: [] };
export default function OrganizationOpportunities({ organization, disabled = false }) {
  const [page, setPage] = useState(null), [error, setError] = useState(null), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [editor, setEditor] = useState(null);
  const request = useRef(null), lock = useRef(false);
  const load = useCallback(async (cursor) => { if (lock.current) return; lock.current = true; setBusy(true); request.current?.abort(); const c = new AbortController(); request.current = c;
    try { const data = await api.list(organization.id, cursor, c.signal); if (!c.signal.aborted) { setPage(old => cursor && old ? { ...data, items: [...old.items, ...data.items] } : data); setError(null); } }
    catch (e) { if (!c.signal.aborted) { setError(e); if ([401, 403, 404].includes(e.status)) { setPage(null); setEditor(null); } } }
    finally { if (!c.signal.aborted) { lock.current = false; setBusy(false); } }
  }, [organization.id]);
  useEffect(() => { let active = true; queueMicrotask(() => { if (active) void load(); }); return () => { active = false; request.current?.abort(); }; }, [load]);
  async function status(o, next) {
    if (lock.current || !window.confirm(`${next === "PUBLISHED" ? "Publish" : OPPORTUNITY_STATUSES[next]} “${o.title}”?${["CLOSED", "CANCELLED", "REMOVED"].includes(next) ? " This cannot be undone. Application history will be preserved." : ""}`)) return;
    lock.current = true; setBusy(true); setNotice(""); const c = new AbortController(); request.current = c;
    try { const result = await api.status(organization.id, o.id, { expectedVersion: o.version, status: next }, c.signal); if (!c.signal.aborted) { setPage(old => ({ ...old, items: old.items.map(row => row.id === result.id ? result : row) })); setError(null); setNotice(`Opportunity ${OPPORTUNITY_STATUSES[next].toLowerCase()}.`); } }
    catch (e) { if (!c.signal.aborted) { setError(e); if ([401, 403, 404].includes(e.status)) setPage(null); } }
    finally { if (!c.signal.aborted) { lock.current = false; setBusy(false); } }
  }
  const blocked = disabled || busy || Boolean(error);
  return <section className="bw-op-workspace"><header className="bw-op-workspace-heading"><div><p className="bw-op-eyebrow">REACH YOUR NEXT APPLICANT</p><h2>Opportunities</h2><p>Create, publish, and manage opportunities from {organization.name}.</p></div><button className="bw-op-primary" type="button" disabled={blocked} onClick={() => setEditor({ new: true })}>+ Create opportunity</button></header>
    {error && <div className="bw-op-feedback" role="alert"><p>{error.message}</p><Link to="/security">Account security</Link> <button type="button" disabled={busy} onClick={() => void load()}>Reload opportunities</button></div>}{notice && <p role="status" className="bw-op-success">{notice}</p>}
    {!page && !error && <p role="status">Loading your opportunities…</p>}
    {page?.items.length === 0 && <div className="bw-op-empty"><h3>Open a door for someone</h3><p>Publish a job, scholarship, challenge, or event. Build an application form and receive responses here.</p></div>}
    <div className="bw-op-managed-list">{page?.items.map(o => <article key={o.id} className="bw-op-managed-card"><div className="bw-op-section-title"><span className={`bw-op-type-label bw-op-${o.type.toLowerCase()}`}>{OPPORTUNITY_TYPES[o.type].label}</span><span className="bw-op-status">{OPPORTUNITY_STATUSES[o.status]}</span></div><h3>{o.title}</h3><p>{o.location} · Deadline {new Date(o.deadline).toLocaleString("en-GB")}</p><div className="bw-op-actions">{["DRAFT", "PAUSED"].includes(o.status) && <button className="bw-op-secondary" type="button" disabled={blocked} onClick={() => setEditor(o)}>Edit</button>}{o.status !== "DRAFT" && o.status !== "REMOVED" && <Link to={`/opportunities/${o.id}`}>View listing</Link>}{transitions[o.status].map(next => <button key={next} type="button" className={next === "PUBLISHED" ? "bw-op-primary" : "bw-op-text-button"} disabled={blocked} onClick={() => void status(o, next)}>{next === "PUBLISHED" ? "Publish" : next === "PAUSED" ? "Pause" : next === "CLOSED" ? "Close" : next === "CANCELLED" ? "Cancel" : "Remove"}</button>)}</div></article>)}</div>
    {page?.nextCursor && <button className="bw-op-secondary" type="button" disabled={busy} onClick={() => void load(page.nextCursor)}>More opportunities</button>}
    {editor && !disabled && <OpportunityEditor key={editor.id || "new"} organizationId={organization.id} opportunity={editor.new ? null : editor} onClose={() => setEditor(null)} onSaved={o => { setEditor(null); setPage(old => ({ ...old, items: old.items.some(row => row.id === o.id) ? old.items.map(row => row.id === o.id ? o : row) : [o, ...old.items] })); setNotice("Draft saved. Publish it when you’re ready."); }} />}
  </section>;
}
