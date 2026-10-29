import { organizationPictureUrl } from "../api/organization-profile";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { organizationsApi } from "../api/organizations";
import { staffApi } from "../api/organization-staff";
import { identityDate } from "./manual-identity-format";
import WorkspaceIcon from "../components/workspace/WorkspaceIcon";
import "./organizations.css";
import "./my-workspace.css";
const pending = status => ["SUBMITTED", "ASSIGNED", "RECOMMENDED"].includes(status);
const stages = { SUBMITTED: [25, "Interest submitted"], ASSIGNED: [50, "Agent review in progress"], RECOMMENDED: [75, "Awaiting BrightWay decision"], APPROVED: [100, "Approved"], REJECTED: [0, "Not approved"], ABORTED: [0, "Aborted by you"] };
function OrganizationImage({ name, type, organization }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase();
  if (organization?.photoId) return <span className="bw-work-image"><img src={organizationPictureUrl(organization.id, organization.photoId)} alt={`${name} profile picture`} /></span>;
  return <span className={`bw-work-image bw-work-image-${type || "ORGANIZATION"}`} role="img" aria-label={`${name} — organization image placeholder`}>{initials}</span>;
}
function AbortDialog({ request, busy, onClose, onAbort }) {
  const dialog = useRef(null), cancel = useRef(null);
  useEffect(() => { const node = dialog.current; if (node.showModal) node.showModal(); else node.setAttribute("open", ""); cancel.current?.focus(); return () => node.close?.(); }, []);
  return <dialog ref={dialog} className="bw-work-abort bw-work-dialog" aria-labelledby="abort-heading" aria-describedby="abort-description" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <span className="bw-work-dialog-icon"><WorkspaceIcon name="alert" size={26} /></span>
    <h2 id="abort-heading">Abort {request.name}?</h2><p id="abort-description">This withdraws your pending request. It cannot be approved after withdrawal. Its review history will be kept; you can submit a new interest later.</p>
    <div className="bw-work-actions"><button ref={cancel} disabled={busy} onClick={onClose}>Keep request</button><button className="bw-work-danger" disabled={busy} onClick={onAbort}>{busy ? "Withdrawing…" : "Abort request"}</button></div>
  </dialog>;
}
const typeLabels = { SCHOOL: "School", NGO: "NGO", COMPANY: "Company" };
const categoryCopy = {
  approved: ["Your organizations", "Open a workspace to manage the work you’re part of."],
  pending: ["In review", "Follow your organization’s progress, from interest to approval."],
  invitations: ["Work better, together", "Review your invitations and choose where to contribute."],
  history: ["Request history", "Your past requests, kept in one place."],
};
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
  const [fetching, setFetching] = useState(false);
  const life = useRef(null), lock = useRef(false), abortTrigger = useRef(null);
  const view = result?.key === key ? result : null;
  const counts = result?.search === query.trim() ? result.counts : {};
  const load = useCallback(async (current, cursor) => {
    setFetching(true);
    current.controller?.abort(); current.controller = new AbortController(); const signal = current.controller.signal;
    try {
      const next = await staffApi.directory(signal, { tab: current.tab, search: current.search, ...(cursor ? { cursor } : {}) });
      if (life.current !== current || signal.aborted) return;
      setResult(old => ({ ...next, key: current.key, items: cursor && old?.key === current.key ? [...new Map([...old.items, ...next.items].map(row => [row.id, row])).values()] : next.items }));
      setError(null); setStale(false);
    } catch (e) {
      if (life.current !== current || signal.aborted || e.name === "AbortError") return;
      setError(e); if ([401, 403, 404].includes(e.status)) { setResult(null); setConfirm(null); }
      setStale(true);
    } finally { if (life.current === current && !signal.aborted) setFetching(false); }
  }, [setResult, setError, setStale, setConfirm, setFetching]);
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
  const disabled = busy || stale || fetching;
  const [categoryTitle, categoryDescription] = categoryCopy[tab];
  return <section className="bw-org-page bw-work-page">
    <header className="bw-work-title">
      <div><p className="bw-work-eyebrow"><span className="bw-work-heading-icon"><WorkspaceIcon size={17} /></span> YOUR WORK, CONNECTED</p><h1>My Workspace</h1><p>Your organizations, requests and invitations.</p></div>
      <Link className="bw-work-create" to="/organizations/new"><WorkspaceIcon name="plus" size={19} />Create an organization</Link>
    </header>
    <div className="bw-work-surface">
      <div className="bw-work-toolbar"><div className="bw-work-search"><label htmlFor="workspace-search" className="bw-work-sr-only">Search organizations</label><WorkspaceIcon name="search" size={20} /><input id="workspace-search" type="search" maxLength={160} disabled={busy} value={query} onChange={event => search(event.target.value)} placeholder="Search organizations…" autoComplete="off" />{query && <button type="button" className="bw-work-search-clear" aria-label="Clear search" disabled={busy} onClick={() => search("")}><WorkspaceIcon name="close" size={16} /></button>}</div>
      <button className="bw-work-refresh-button" title="Reload workspaces" aria-label="Reload workspaces" disabled={busy || fetching} onClick={() => { if (!lock.current) { close(); void load(life.current); } }}><WorkspaceIcon name="refresh" size={18} className={fetching ? "bw-work-spinning" : ""} /><span>{fetching ? "Refreshing" : "Refresh"}</span></button></div>
      <nav className="bw-work-tabs" aria-label="Workspace categories">{Object.entries(tabs).map(([value, label]) => <button key={value} type="button" disabled={busy} aria-current={tab === value || value === "pending" && tab === "history" ? "page" : undefined} onClick={() => changeTab(value)}><WorkspaceIcon name={value === "approved" ? "building" : value === "pending" ? "clock" : "mail"} size={18} /><span>{label}</span>{counts[value] !== undefined && <span className="bw-work-count">{counts[value]}</span>}</button>)}</nav>
      <div className="bw-work-section-heading"><div><h2>{categoryTitle}</h2><p>{categoryDescription}</p></div>{(tab === "pending" || tab === "history") && <button type="button" className="bw-work-history" disabled={busy} onClick={() => changeTab(tab === "history" ? "pending" : "history")}><WorkspaceIcon name="archive" size={16} />{tab === "history" ? "Back to pending requests" : `Request history${counts.history !== undefined ? ` (${counts.history})` : ""}`}</button>}</div>
      {error && <div className="bw-work-feedback bw-work-feedback-error" role="alert"><WorkspaceIcon name="alert" /><div><strong>We couldn’t complete that request</strong><p>{error.message}</p></div></div>}
      {notice && <div className="bw-work-feedback bw-work-feedback-success" role="status"><WorkspaceIcon name="check" /><p>{notice}</p></div>}
      {stale && <p className="bw-work-stale">Reload workspaces before another action. Nothing will be retried automatically.</p>}
      {!view && !error && <div className="bw-work-loading"><p role="status">Loading your workspaces…</p><div className="bw-work-skeleton" aria-hidden="true"><i /><span /><span /></div><div className="bw-work-skeleton" aria-hidden="true"><i /><span /><span /></div></div>}
      {view && <div aria-label={tab === "history" ? "Request history" : tabs[tab]} aria-busy={fetching}>
        <p className="bw-work-result-count" aria-live="polite">{view.counts[tab]} {tab === "invitations" ? "invitation" : "organization"}{view.counts[tab] === 1 ? "" : "s"}{query.trim() ? ` matching “${query.trim()}”` : ""}</p>
        <ul className="bw-work-grid">{view.items.map(row => {
          const name = row.organization?.name || row.name, type = row.organization?.type || row.type;
          const state = tab === "approved" ? "approved" : tab === "invitations" ? "invited" : row.status.toLowerCase();
          const [progress, stageLabel] = stages[row.status] || [0, ""];
          return <li key={row.id} id={`request-${row.id}`}><article className={`bw-work-card bw-work-card-${tab}`}>
            <div className="bw-work-card-top"><div className="bw-work-card-heading"><OrganizationImage name={name} type={type} organization={tab === "approved" ? row : row.organization} /><div><span className="bw-work-type">{typeLabels[type] || "Organization"}</span><h3>{name}</h3><p>{tab === "approved" ? row.role === "PRIMARY_ADMIN" ? "Primary administrator" : "Staff" : tab === "invitations" ? "Invited as staff" : row.representativeRole || "Organization representative"}</p></div></div>
              <span className={`bw-work-state bw-work-state-${state}`}><WorkspaceIcon name={tab === "approved" ? "check" : tab === "invitations" ? "mail" : pending(row.status) ? "clock" : "archive"} size={14} />{tab === "approved" ? "Approved" : tab === "invitations" ? "Invitation" : stageLabel}</span></div>
            {tab === "pending" && pending(row.status) && <div className="bw-work-progress"><div className="bw-work-progress-label"><span>Review progress</span><strong>{progress}%</strong></div><progress max="100" value={progress} aria-label={`${name} review progress`}>{progress}%</progress><ol className="bw-work-stages" aria-label={`${name} review stages`}>{["Submitted", "Agent review", "Decision"].map((label, index) => <li key={label} data-reached={progress >= (index + 1) * 25}><span />{label}</li>)}</ol><p className={`bw-work-hint${row.overdue ? " bw-work-overdue" : ""}`}><WorkspaceIcon name="clock" size={14} />Review target: {identityDate(row.targetAt)}{row.overdue && " · Awaiting a decision"}</p></div>}
            {tab === "invitations" && <div className="bw-work-invitation-details"><p className="bw-work-detail-label">Proposed access</p><ul className="bw-work-permissions" aria-label="Proposed permissions">{(row.permissionLabels.length ? row.permissionLabels : ["Organization workspace access"]).map(label => <li key={label}>{label}</li>)}</ul><p className="bw-work-hint"><WorkspaceIcon name="clock" size={14} />Expires {identityDate(row.expiresAt)}</p></div>}
            {row.decisionReason && <div className="bw-work-decision"><span>BrightWay feedback</span><p>{row.decisionReason}</p></div>}
            <footer className="bw-work-card-footer">
              <p className="bw-work-card-note"><WorkspaceIcon name={tab === "approved" ? "shield" : tab === "invitations" ? "building" : "shield"} size={16} />{tab === "approved" ? "Your access follows your organization role" : tab === "invitations" ? "Join using your existing BrightWay account" : tab === "history" ? "Saved in your private request history" : "Only you and authorized reviewers can see this request"}</p>
              <div className="bw-work-actions">{tab === "approved" ? <Link className="bw-org-workspace-entry" to={`/organization-workspace/${row.id}`}>Manage<WorkspaceIcon name="arrow" size={17} /></Link>
                : tab === "invitations" ? <><button className="bw-work-secondary" disabled={disabled} aria-label={`Decline invitation from ${name}`} onClick={() => void action(() => staffApi.respond(row.id, { expectedVersion: row.version, decision: "DECLINE" }))}>Decline</button><button className="bw-work-primary" disabled={disabled} aria-label={`Accept invitation from ${name}`} onClick={() => void action(() => staffApi.respond(row.id, { expectedVersion: row.version, decision: "ACCEPT" }), true)}>Accept invitation<WorkspaceIcon name="arrow" size={16} /></button></>
                  : pending(row.status) && <><Link className="bw-work-edit" aria-disabled={disabled} to={`/work/requests/${row.id}/edit`} onClick={event => { if (disabled) event.preventDefault(); }}><WorkspaceIcon name="edit" size={16} />Edit</Link><button className="bw-work-text-danger" disabled={disabled} onClick={event => { abortTrigger.current = event.currentTarget; setConfirm(row); }}>Abort</button></>}</div>
            </footer>
          </article></li>;
        })}</ul>
        {!view.items.length && <div className="bw-work-empty"><span className="bw-work-empty-art"><WorkspaceIcon name={query.trim() ? "search" : tab === "invitations" ? "mail" : tab === "history" ? "archive" : "building"} size={38} /></span><h2>{query.trim() ? "No organizations found" : tab === "approved" ? "No approved organizations yet" : tab === "pending" ? "No pending requests" : tab === "invitations" ? "No pending invitations" : "No request history"}</h2><p>{query.trim() ? "Try another organization name or clear your search to see this category." : tab === "approved" ? "Create an organization or accept an invitation. Your workspaces will be ready here when you are." : tab === "pending" ? "New organization requests appear here while BrightWay reviews them." : tab === "invitations" ? "When an organization invites you to join, you can review your access and respond here." : "Rejected and aborted requests remain here for your records."}</p>{query.trim() ? <button type="button" className="bw-work-primary" disabled={busy} onClick={() => search("")}>Show all {tab === "history" ? "history" : tabs[tab].toLowerCase()}</button> : (tab === "approved" || tab === "pending") && <Link className="bw-work-empty-create" to="/organizations/new">Start an organization request<WorkspaceIcon name="arrow" size={16} /></Link>}</div>}
        {view.nextCursor && <div className="bw-work-pagination"><button className="bw-work-secondary" disabled={disabled} onClick={() => void more()}>{busy ? "Loading…" : `Load more ${tab === "history" ? "history" : tabs[tab].toLowerCase()}`}</button><span>Showing {view.items.length} of {view.counts[tab]}</span></div>}
      </div>}
    </div>
    <p className="bw-work-page-note"><WorkspaceIcon name="shield" size={15} />One BrightWay account. A separate, secure workspace for every organization.</p>
    {confirm && <AbortDialog request={confirm} busy={busy} onClose={close} onAbort={() => void action(() => organizationsApi.abort(confirm.id, { expectedVersion: confirm.version }))} />}
  </section>;
}
