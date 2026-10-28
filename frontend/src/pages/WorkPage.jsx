import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { organizationsApi } from "../api/organizations";
import { staffApi } from "../api/organization-staff";
import { identityDate } from "./manual-identity-format";
import "./organizations.css";
const pending = status => ["SUBMITTED", "ASSIGNED", "RECOMMENDED"].includes(status);
const stages = { SUBMITTED: [25, "Interest submitted"], ASSIGNED: [50, "Agent review in progress"], RECOMMENDED: [75, "Awaiting BrightWay decision"], APPROVED: [100, "Approved"], REJECTED: [0, "Not approved"], ABORTED: [0, "Aborted by you"] };
function OrganizationImage({ name }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase();
  return <span className="bw-work-image" role="img" aria-label={`${name} — organization image placeholder`}>{initials}</span>;
}
function AbortDialog({ request, busy, onClose, onAbort }) {
  const dialog = useRef(null), cancel = useRef(null);
  useEffect(() => { const node = dialog.current; if (node.showModal) node.showModal(); else node.setAttribute("open", ""); cancel.current?.focus(); return () => node.close?.(); }, []);
  return <dialog ref={dialog} className="bw-work-abort" aria-labelledby="abort-heading" aria-describedby="abort-description" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <h2 id="abort-heading">Abort {request.name}?</h2><p id="abort-description">This withdraws your pending request. It cannot be approved after withdrawal. Its review history will be kept; you can submit a new interest later.</p>
    <div className="bw-work-actions"><button ref={cancel} disabled={busy} onClick={onClose}>Keep request</button><button className="bw-work-danger" disabled={busy} onClick={onAbort}>{busy ? "Withdrawing…" : "Abort request"}</button></div>
  </dialog>;
}
export default function WorkPage() {
  const { account } = useAuth();
  return <Work key={account?.id || "anonymous"} actor={account?.id} />;
}
function Work({ actor }) {
  const [view, setView] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(null), [notice, setNotice] = useState(""), [stale, setStale] = useState(false), [query, setQuery] = useState("");
  const life = useRef(null), lock = useRef(false), abortTrigger = useRef(null), { hash } = useLocation();
  const load = useCallback(async current => {
    current.controller?.abort(); current.controller = new AbortController(); const signal = current.controller.signal;
    try {
      const [requests, memberships] = await Promise.all([organizationsApi.list(signal), staffApi.home(signal)]);
      if (life.current !== current || signal.aborted) return;
      setView({ ...requests, ...memberships }); setError(null); setStale(false);
    } catch (e) { if (life.current !== current || signal.aborted || e.name === "AbortError") return; setError(e); if ([401, 403, 404].includes(e.status)) { setView(null); setConfirm(null); } }
  }, []);
  useEffect(() => {
    const current = {}; life.current = current;
    if (actor) void Promise.resolve().then(() => { if (life.current === current) return load(current); });
    const focus = () => { if (!lock.current) void load(current); }; window.addEventListener("focus", focus);
    return () => { current.controller?.abort(); if (life.current === current) life.current = null; window.removeEventListener("focus", focus); };
  }, [actor, load]);
  useEffect(() => { if (view && hash) document.getElementById(hash.slice(1))?.scrollIntoView?.({ block: "center" }); }, [view, hash]);
  async function more(kind) {
    if (lock.current || !view || stale) return; lock.current = true; setBusy(true); const current = life.current;
    try {
      const next = kind === "requests" ? await organizationsApi.list(undefined, view.nextCursor) : await staffApi.home(undefined, { memberCursor: view.nextMemberCursor });
      if (life.current !== current) return;
      const cursor = kind === "requests" ? "nextCursor" : "nextMemberCursor";
      const key = kind === "requests" ? "requests" : "organizations";
      setView(old => ({ ...old, [key]: [...new Map([...old[key], ...next[key]].map(row => [row.id, row])).values()], [cursor]: next[cursor] }));
    } catch (e) { if (life.current === current) { setError(e); if ([401, 403, 404].includes(e.status)) { setView(null); setConfirm(null); } } }
    finally { if (life.current === current) { lock.current = false; setBusy(false); } }
  }
  function close() { setConfirm(null); abortTrigger.current?.focus(); }
  async function abort() {
    if (lock.current || !confirm) return; lock.current = true; setBusy(true); const current = life.current; current?.controller?.abort();
    try {
      const result = await organizationsApi.abort(confirm.id, { expectedVersion: confirm.version });
      if (life.current !== current) return;
      setView(old => ({ ...old, requests: old.requests.map(r => r.id === result.id ? result : r) })); setNotice(`Your request for “${result.name}” has been aborted.`); setError(null); close();
    } catch (e) {
      if (life.current !== current) return; setError(e); close();
      if (e.status === 409 || !e.status || e.status >= 500) setStale(true);
      if ([401, 403, 404].includes(e.status)) setView(null);
    } finally { if (life.current === current) { lock.current = false; setBusy(false); } }
  }
  const memberships = view?.organizations || [], memberIds = new Set(memberships.map(o => o.id));
  const requests = (view?.requests || []).filter(r => !r.organizationId || !memberIds.has(r.organizationId));
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleRequests = normalizedQuery ? requests.filter(r => r.name.toLocaleLowerCase().includes(normalizedQuery)) : requests;
  const visibleMemberships = normalizedQuery ? memberships.filter(o => o.name.toLocaleLowerCase().includes(normalizedQuery)) : memberships;
  const total = requests.length + memberships.length, visibleTotal = visibleRequests.length + visibleMemberships.length;
  return <section className="bw-org-page bw-work-page"><header className="bw-work-title"><div><h1>My Workspace</h1><p>Your organization requests and the organizations you work with.</p></div><Link className="bw-work-create" to="/organizations/new" aria-label="Create an organization" title="Create an organization">+</Link></header>
    <div className="bw-work-search"><label htmlFor="workspace-search">Search organizations</label><input id="workspace-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by organization name" autoComplete="off" /></div>
    <div className="bw-work-refresh"><span aria-live="polite">{view ? `${visibleTotal} of ${total} organization${total === 1 ? "" : "s"}` : ""}</span><button disabled={busy} onClick={() => { if (!lock.current) { close(); void load(life.current); } }}>Reload workspaces</button></div>
    {error && <p role="alert">{error.message}</p>}{notice && <p role="status">{notice}</p>}{stale && <p>Reload workspaces to check the latest request before another action. Nothing will be retried automatically.</p>}
    {!view && !error && <p role="status">Loading your workspaces…</p>}
    {view && <>{!total && <div className="bw-work-empty"><h3>Your work starts here</h3><p>Submit your interest to create an organization, or accept a staff invitation.</p><Link to="/organizations/new">+ Create an organization</Link></div>}
      <ul className="bw-work-grid">{visibleRequests.map(r => { const [progress, label] = stages[r.status] || [0, r.status]; return <li key={r.id} id={`request-${r.id}`}><article className="bw-work-card"><div className="bw-work-card-heading"><OrganizationImage name={r.name} /><div><h3>{r.name}</h3><p>{r.status === "APPROVED" && r.userRole ? r.userRole === "PRIMARY_ADMIN" ? "Primary administrator" : "Staff" : r.representativeRole || "Organization representative"}</p></div></div><p className={`bw-work-state bw-work-state-${r.status.toLowerCase()}`}>{label}</p>
        {pending(r.status) && <><progress max="100" value={progress} aria-label={`${r.name} review progress`}>{progress}%</progress><p className="bw-work-hint">Review target: {identityDate(r.targetAt)}{r.overdue ? " · Past target; a decision is still required." : " · Progress follows review stages."}</p></>}
        {r.decisionReason && <p>{r.decisionReason}</p>}
        <div className="bw-work-actions">{pending(r.status) ? <><Link aria-disabled={busy || stale} to={`/work/requests/${r.id}/edit`} onClick={e => { if (busy || stale) e.preventDefault(); }}>Edit</Link><button className="bw-work-text-danger" disabled={busy || stale} onClick={event => { abortTrigger.current = event.currentTarget; setConfirm(r); }}>Abort</button></> : r.status === "APPROVED" && r.workspaceAvailable ? <Link className="bw-org-workspace-entry" to={`/organization-workspace/${r.organizationId}`}>Manage</Link> : r.status === "APPROVED" ? <p>Workspace access is unavailable.</p> : <Link to="/organizations/new">Create another organization</Link>}</div>
      </article></li>; })}{visibleMemberships.map(o => <li key={o.id}><article className="bw-work-card"><div className="bw-work-card-heading"><OrganizationImage name={o.name} /><div><h3>{o.name}</h3><p>{o.role === "PRIMARY_ADMIN" ? "Primary administrator" : "Staff"}</p></div></div><p className="bw-work-state bw-work-state-approved">Approved organization</p><div className="bw-work-actions"><Link className="bw-org-workspace-entry" to={`/organization-workspace/${o.id}`}>Manage</Link></div></article></li>)}</ul>
      {total > 0 && visibleTotal === 0 && <div className="bw-work-empty"><h2>No organizations found</h2><p>Try another organization name or clear the search.</p><button type="button" onClick={() => setQuery("")}>Clear search</button></div>}
      <div className="bw-work-actions">{view.nextCursor && <button disabled={busy || stale} onClick={() => void more("requests")}>More organization requests</button>}{view.nextMemberCursor && <button disabled={busy || stale} onClick={() => void more("organizations")}>More organizations</button>}</div>
      <p><Link to="/organization-workspace">View staff invitations and switch accounts</Link></p>
    </>}
    {confirm && <AbortDialog request={confirm} busy={busy} onClose={close} onAbort={() => void abort()} />}
  </section>;
}
