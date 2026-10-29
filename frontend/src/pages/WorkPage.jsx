import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
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
const tabs = { approved: "Approved", pending: "Pending", invitations: "Invitations" };
export default function WorkPage() {
  const { account } = useAuth();
  return <Work key={account?.id || "anonymous"} actor={account?.id} />;
}
function Work({ actor }) {
  const [params, setParams] = useSearchParams(), { hash } = useLocation();
  const tab = ["approved", "pending", "invitations", "history"].includes(params.get("tab")) ? params.get("tab") : hash ? "pending" : "approved";
  const query = params.get("search") || "", key = `${tab}:${query.trim()}`;
  const [result, setResult] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(null), [notice, setNotice] = useState(""), [stale, setStale] = useState(false);
  const life = useRef(null), lock = useRef(false), abortTrigger = useRef(null);
  const view = result?.key === key ? result : null;
  const counts = result?.search === query.trim() ? result.counts : {};
  const load = useCallback(async (current, cursor) => {
    current.controller?.abort(); current.controller = new AbortController(); const signal = current.controller.signal;
    try {
      const next = await staffApi.directory(signal, { tab: current.tab, search: current.search, ...(cursor ? { cursor } : {}) });
      if (life.current !== current || signal.aborted) return;
      setResult(old => ({ ...next, key: current.key, items: cursor && old?.key === current.key ? [...new Map([...old.items, ...next.items].map(row => [row.id, row])).values()] : next.items }));
      setError(null); setStale(false);
    } catch (e) {
      if (life.current !== current || signal.aborted || e.name === "AbortError") return;
      setError(e); if ([401, 403, 404].includes(e.status)) { setResult(null); setConfirm(null); }
      if (e.status === 409) setStale(true);
    }
  }, [setResult, setError, setStale, setConfirm]);
  useEffect(() => {
    const current = { tab, search: query.trim(), key }; life.current = current;
    const timer = setTimeout(() => { if (actor) void load(current); }, 200);
    const focus = () => { if (!lock.current) void load(current); }; window.addEventListener("focus", focus);
    return () => { clearTimeout(timer); current.controller?.abort(); if (life.current === current) life.current = null; window.removeEventListener("focus", focus); };
  }, [actor, key, tab, query, load]);
  useEffect(() => { if (view && hash) document.getElementById(hash.slice(1))?.scrollIntoView?.({ block: "center" }); }, [view, hash]);
  function changeTab(next) { if (lock.current) return; setConfirm(null); setError(null); setStale(false); setNotice(""); setParams({ tab: next, ...(query ? { search: query } : {}) }); }
  function search(value) { if (lock.current) return; setError(null); setStale(false); setParams({ tab, ...(value ? { search: value } : {}) }, { replace: true }); }
  function close() { setConfirm(null); abortTrigger.current?.focus(); }
  async function action(work, accepted = false) {
    if (lock.current || stale) return; lock.current = true; setBusy(true); const current = life.current; current?.controller?.abort();
    try {
      await work(); if (life.current !== current) return;
      close(); setNotice(accepted ? "Invitation accepted. Your organization is in Approved." : "Saved. The list has been refreshed.");
      if (accepted) { setResult(null); setParams({ tab: "approved" }); }
      else await load(current);
    } catch (e) {
      if (life.current !== current) return; setError(e); close(); setStale(true);
      if ([401, 403, 404].includes(e.status)) setResult(null);
    } finally { if (life.current === current) lock.current = false; setBusy(false); }
  }
  async function more() { if (lock.current || !view?.nextCursor || stale) return; lock.current = true; setBusy(true); try { await load(life.current, view.nextCursor); } finally { lock.current = false; setBusy(false); } }
  const disabled = busy || stale;
  return <section className="bw-org-page bw-work-page">
    <header className="bw-work-title"><div><h1>My Workspace</h1><p>Your organizations, requests and invitations.</p></div><Link className="bw-work-create" to="/organizations/new">Create an organization</Link></header>
    <div className="bw-work-search"><label htmlFor="workspace-search">Search organizations</label><input id="workspace-search" type="search" maxLength={160} disabled={busy} value={query} onChange={event => search(event.target.value)} placeholder="Search by organization name" autoComplete="off" /></div>
    <nav className="bw-work-tabs" aria-label="Workspace categories">{Object.entries(tabs).map(([value, label]) => <button key={value} type="button" disabled={busy} aria-current={tab === value || value === "pending" && tab === "history" ? "page" : undefined} onClick={() => changeTab(value)}>{label}{counts[value] !== undefined && <span className="bw-work-count">{counts[value]}</span>}</button>)}</nav>
    {(tab === "pending" || tab === "history") && <button type="button" className="bw-work-history" disabled={busy} onClick={() => changeTab(tab === "history" ? "pending" : "history")}>{tab === "history" ? "Back to pending requests" : `Request history${counts.history !== undefined ? ` (${counts.history})` : ""}`}</button>}
    <div className="bw-work-refresh"><span aria-live="polite">{view ? `${view.counts[tab]} ${tab === "invitations" ? "invitation" : "organization"}${view.counts[tab] === 1 ? "" : "s"}${query.trim() ? " found" : ""}` : ""}</span><button disabled={busy} onClick={() => { if (!lock.current) { close(); void load(life.current); } }}>Reload workspaces</button></div>
    {error && <p role="alert">{error.message}</p>}{notice && <p role="status">{notice}</p>}{stale && <p>Reload workspaces before another action. Nothing will be retried automatically.</p>}
    {!view && !error && <p role="status">Loading your workspaces…</p>}
    {view && <div aria-label={tab === "history" ? "Request history" : tabs[tab]}><ul className="bw-work-grid">{view.items.map(row => {
      const name = row.organization?.name || row.name;
      return <li key={row.id} id={`request-${row.id}`}><article className="bw-work-card"><div className="bw-work-card-heading"><OrganizationImage name={name} /><div><h3>{name}</h3><p>{tab === "approved" ? row.role === "PRIMARY_ADMIN" ? "Primary administrator" : "Staff" : tab === "invitations" ? "Invited as staff" : row.representativeRole || "Organization representative"}</p></div></div>
        {tab === "approved" ? <><p className="bw-work-state bw-work-state-approved">Approved organization</p><div className="bw-work-actions"><Link className="bw-org-workspace-entry" to={`/organization-workspace/${row.id}`}>Manage</Link></div></>
          : tab === "invitations" ? <><p>Proposed access: {row.permissionLabels.length ? row.permissionLabels.join(", ") : "Organization workspace access"}</p><p>Expires {identityDate(row.expiresAt)}</p><div className="bw-work-actions"><button disabled={disabled} onClick={() => void action(() => staffApi.respond(row.id, { expectedVersion: row.version, decision: "ACCEPT" }), true)}>Accept invitation from {name}</button><button className="bw-work-secondary" disabled={disabled} onClick={() => void action(() => staffApi.respond(row.id, { expectedVersion: row.version, decision: "DECLINE" }))}>Decline invitation from {name}</button></div></>
            : <><p className="bw-work-state">{stages[row.status]?.[1] || row.status}</p>{pending(row.status) && <><progress max="100" value={stages[row.status][0]} aria-label={`${name} review progress`}>{stages[row.status][0]}%</progress><p className="bw-work-hint">Review target: {identityDate(row.targetAt)}{row.overdue ? " · Past target; a decision is still required." : " · Progress follows review stages."}</p></>}{row.decisionReason && <p>{row.decisionReason}</p>}{pending(row.status) && <div className="bw-work-actions"><Link aria-disabled={disabled} to={`/work/requests/${row.id}/edit`} onClick={event => { if (disabled) event.preventDefault(); }}>Edit</Link><button className="bw-work-text-danger" disabled={disabled} onClick={event => { abortTrigger.current = event.currentTarget; setConfirm(row); }}>Abort</button></div>}</>}
      </article></li>;
    })}</ul>
      {!view.items.length && <div className="bw-work-empty"><h2>{query.trim() ? "No organizations found" : tab === "approved" ? "No approved organizations yet" : tab === "pending" ? "No pending requests" : tab === "invitations" ? "No pending invitations" : "No request history"}</h2><p>{query.trim() ? "Try another organization name or clear the search." : tab === "approved" ? "Your active organizations will appear here after approval or accepting an invitation." : tab === "pending" ? "New organization requests appear here while BrightWay reviews them." : tab === "invitations" ? "Incoming staff invitations will appear here for you to accept or decline." : "Rejected and aborted requests remain here for your records."}</p>{query.trim() && <button type="button" disabled={busy} onClick={() => search("")}>Clear search</button>}</div>}
      {view.nextCursor && <button disabled={disabled} onClick={() => void more()}>Load more {tab === "history" ? "history" : tabs[tab].toLowerCase()}</button>}
    </div>}
    {confirm && <AbortDialog request={confirm} busy={busy} onClose={close} onAbort={() => void action(() => organizationsApi.abort(confirm.id, { expectedVersion: confirm.version }))} />}
  </section>;
}
