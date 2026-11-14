import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { opportunitiesApi as api } from "../../api/opportunities";
import { OPPORTUNITY_TYPES, OPPORTUNITY_STATUSES } from "../../../../shared/opportunities.mjs";
import NavigationIcon from "../layout/NavigationIcon";
import OpportunityEditor from "./OpportunityEditor";
import "./opportunities.css";
import "./organization-opportunities.css";

const transitions = {
  DRAFT: ["PUBLISHED", "CANCELLED", "REMOVED"],
  PUBLISHED: ["PAUSED", "CLOSED", "CANCELLED", "REMOVED"],
  PAUSED: ["PUBLISHED", "CLOSED", "CANCELLED", "REMOVED"],
  CLOSED: ["REMOVED"],
  CANCELLED: ["REMOVED"],
  REMOVED: [],
};
const STATUS_FILTERS = [
  ["ALL", "All"],
  ["PUBLISHED", "Published"],
  ["DRAFT", "Drafts"],
  ["PAUSED", "Paused"],
  ["CLOSED", "Closed"],
];
const PRIMARY_ACTIONS = { DRAFT: "PUBLISHED", PUBLISHED: "PAUSED", PAUSED: "PUBLISHED" };
const DESTRUCTIVE = new Set(["CLOSED", "CANCELLED", "REMOVED"]);
const dateLabel = value => {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "Not set";
};
function actionLabel(next, current) {
  if (next === "PUBLISHED") return current === "PAUSED" ? "Resume" : "Publish";
  if (next === "PAUSED") return "Pause";
  return next === "CLOSED" ? "Close" : next === "CANCELLED" ? "Cancel" : "Remove";
}
function StatusBadge({ status }) {
  return <span className={`bw-op-manage-status bw-op-manage-status--${status.toLowerCase()}`}>
    <span className="bw-op-manage-status-dot" aria-hidden="true" />{OPPORTUNITY_STATUSES[status] || status}
  </span>;
}

export default function OrganizationOpportunities({ organization, disabled = false }) {
  const [page, setPage] = useState(null), [error, setError] = useState(null);
  const [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [editor, setEditor] = useState(null);
  const [search, setSearch] = useState(""), [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL"), [sort, setSort] = useState("NEWEST");
  const request = useRef(null), lock = useRef(false);
  const load = useCallback(async cursor => {
    if (lock.current) return;
    lock.current = true; setBusy(true); request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    try {
      const data = await api.list(organization.id, cursor, controller.signal);
      if (!controller.signal.aborted) {
        setPage(old => cursor && old ? { ...data, items: [...old.items, ...data.items] } : data);
        setError(null);
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause);
        if ([401, 403, 404].includes(cause.status)) { setPage(null); setEditor(null); }
      }
    } finally {
      if (!controller.signal.aborted) { lock.current = false; setBusy(false); }
    }
  }, [organization.id]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void load(); });
    return () => { active = false; request.current?.abort(); };
  }, [load]);

  async function changeStatus(opportunity, next) {
    const action = actionLabel(next, opportunity.status);
    if (lock.current || !window.confirm(`${action} “${opportunity.title}”?${DESTRUCTIVE.has(next) ? " This cannot be undone. Application history will be preserved." : ""}`)) return;
    lock.current = true; setBusy(true); setNotice("");
    const controller = new AbortController(); request.current = controller;
    try {
      const updated = await api.status(organization.id, opportunity.id,
        { expectedVersion: opportunity.version, status: next }, controller.signal);
      if (!controller.signal.aborted) {
        setPage(old => ({ ...old, items: old.items.map(row => row.id === updated.id ? updated : row) }));
        setError(null);
        setNotice(`“${opportunity.title}” ${next === "PUBLISHED" ? "published" : OPPORTUNITY_STATUSES[next].toLowerCase()}.`);
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause);
        if ([401, 403, 404].includes(cause.status)) { setPage(null); setEditor(null); }
      }
    } finally {
      if (!controller.signal.aborted) { lock.current = false; setBusy(false); }
    }
  }

  const items = page?.items || [];
  const counts = useMemo(() => ({
    ALL: items.length,
    PUBLISHED: items.filter(o => o.status === "PUBLISHED").length,
    DRAFT: items.filter(o => o.status === "DRAFT").length,
    PAUSED: items.filter(o => o.status === "PAUSED").length,
    CLOSED: items.filter(o => o.status === "CLOSED").length,
  }), [page]); // Counts are for loaded records, not totals across all pages.
  const visible = useMemo(() => items.filter(o =>
    (statusFilter === "ALL" || o.status === statusFilter) &&
    (typeFilter === "ALL" || o.type === typeFilter) &&
    (!search.trim() || [o.title, o.location, o.description].some(v =>
      String(v || "").toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())))
  ).sort((a, b) => {
    if (sort === "DEADLINE") return (new Date(a.deadline).getTime() || 0) - (new Date(b.deadline).getTime() || 0);
    if (sort === "TITLE") return a.title.localeCompare(b.title);
    return (new Date(b.createdAt).getTime() || 0) - (new Date(a.createdAt).getTime() || 0);
  }), [page, statusFilter, typeFilter, search, sort]);
  const blocked = disabled || busy || Boolean(error);
  const hasFilters = Boolean(search) || statusFilter !== "ALL" || typeFilter !== "ALL";
  function clearFilters() { setSearch(""); setStatusFilter("ALL"); setTypeFilter("ALL"); }

  return <section className="bw-op-workspace bw-op-dashboard" aria-labelledby="bw-op-dashboard-title">
    <nav className="bw-op-dashboard-breadcrumb" aria-label="Opportunity workspace breadcrumb">
      <Link to="/work">My Workspace</Link><NavigationIcon name="chevron-right" size={14} />
      <Link to={`/organization-workspace/${organization.id}`}>{organization.name}</Link>
      <NavigationIcon name="chevron-right" size={14} /><span>Opportunities</span>
    </nav>
    <header className="bw-op-workspace-heading bw-op-dashboard-header">
      <div>
        <h1 id="bw-op-dashboard-title">Opportunities</h1>
        <p>Publish and manage jobs, scholarships, challenges, and events.</p>
      </div>
      <button className="bw-op-primary bw-op-dashboard-create" type="button" disabled={blocked}
        onClick={() => setEditor({ new: true })}><NavigationIcon name="post" size={18} />+ Create opportunity</button>
    </header>

    {error && <div className="bw-op-feedback bw-op-dashboard-feedback" role="alert">
      <p>{error.message}</p><div><Link to="/security">Account security</Link>
        <button type="button" disabled={busy || disabled} onClick={() => void load()}>Reload opportunities</button></div>
    </div>}
    {notice && <p role="status" className="bw-op-success bw-op-dashboard-notice">{notice}</p>}
    {!page && !error && <div className="bw-op-dashboard-loading" role="status">Loading opportunities…</div>}

    {page && <div className="bw-op-dashboard-metrics" aria-label="Loaded opportunity summary">
      {[
        ["ALL", "Listings loaded", "opportunities"],
        ["PUBLISHED", "Published", "opportunities"],
        ["DRAFT", "Drafts", "file-text"],
        ["PAUSED", "Paused", "pause"],
      ].map(([key, label, icon]) => <div key={key} className="bw-op-dashboard-metric">
        <span className="bw-op-dashboard-metric-icon"><NavigationIcon name={icon} size={18} /></span>
        <span className="bw-op-dashboard-metric-value">{counts[key]}</span>
        <span className="bw-op-dashboard-metric-label">{label}</span>
      </div>)}
    </div>}

    {page && <div className="bw-op-dashboard-panel">
      <div className="bw-op-dashboard-panel-header">
        <div><h3>Manage listings</h3>
          <p>{page.nextCursor ? "Counts reflect listings loaded so far." : "All available listings for this organization."}</p>
        </div>
        <button className="bw-op-dashboard-refresh" type="button" disabled={busy || disabled}
          onClick={() => void load()} aria-label="Refresh opportunities">
          <NavigationIcon name="refresh" size={17} /><span>Refresh</span>
        </button>
      </div>
      <div className="bw-op-dashboard-toolbar">
        <label className="bw-op-dashboard-search"><NavigationIcon name="search" size={18} />
          <span className="bw-op-dashboard-sr-only">Search opportunities</span>
          <input type="search" placeholder="Search listings" value={search} onChange={e => setSearch(e.target.value)}
            aria-label="Search opportunities" />
        </label>
        <label className="bw-op-dashboard-select">Type
          <select aria-label="Filter opportunity type" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="ALL">All types</option>
            {Object.entries(OPPORTUNITY_TYPES).map(([key, value]) => <option key={key} value={key}>{value.plural}</option>)}
          </select>
        </label>
        <label className="bw-op-dashboard-select">Sort
          <select aria-label="Sort opportunities" value={sort} onChange={e => setSort(e.target.value)}>
            <option value="NEWEST">Newest</option>
            <option value="DEADLINE">Deadline soon</option>
            <option value="TITLE">Title A–Z</option>
          </select>
        </label>
      </div>
      <nav className="bw-op-dashboard-filters" aria-label="Opportunity status filters">
        {STATUS_FILTERS.map(([key, label]) => <button type="button" key={key} aria-pressed={statusFilter === key}
          onClick={() => setStatusFilter(key)}>
          {label}<span aria-hidden="true">{counts[key]}</span>
        </button>)}
      </nav>
      {items.length === 0 ? <div className="bw-op-dashboard-empty">
        <span className="bw-op-dashboard-empty-icon"><NavigationIcon name="opportunities" size={26} /></span>
        <h3>No opportunities yet</h3>
        <p>Create your first listing to start receiving applications on BrightWay.</p>
        <button type="button" className="bw-op-primary" disabled={blocked} onClick={() => setEditor({ new: true })}>+ Create opportunity</button>
      </div> : visible.length === 0 ? <div className="bw-op-dashboard-empty">
        <h3>No matching listings</h3><p>Try another search, type, or status.</p>
        {hasFilters && <button type="button" className="bw-op-secondary" onClick={clearFilters}>Clear filters</button>}
      </div> : <div className="bw-op-managed-list">
        {visible.map(o => {
          const type = OPPORTUNITY_TYPES[o.type];
          const next = PRIMARY_ACTIONS[o.status];
          const secondary = transitions[o.status].filter(s => s !== next);
          const live = o.status === "PUBLISHED";
          return <article key={o.id} className="bw-op-managed-card" aria-label={o.title}>
            <div className="bw-op-managed-head">
              <span className={`bw-op-managed-type bw-op-managed-type--${o.type.toLowerCase()}`}>
                <NavigationIcon name={type?.icon || "opportunities"} size={16} />{type?.label || o.type}
              </span>
              <StatusBadge status={o.status} />
            </div>
            <h3 className="bw-op-managed-title">{live
              ? <Link to={`/opportunities/${o.id}`}>{o.title}</Link>
              : o.title}</h3>
            <div className="bw-op-managed-meta">
              <span><NavigationIcon name="pin" size={15} />{o.location}</span>
              <span><NavigationIcon name="calendar" size={15} />Closes {dateLabel(o.deadline)}</span>
              <span><NavigationIcon name="opportunities" size={15} />{o.workMode === "REMOTE" ? "Online" : o.workMode === "HYBRID" ? "Hybrid" : "In person"}</span>
            </div>
            <div className="bw-op-managed-bottom">
              <div className="bw-op-managed-summary">
                <span>{o.status === "DRAFT" ? "Not published" : o.status === "PUBLISHED" ? "Visible to eligible members" : o.status === "PAUSED" ? "Hidden from discovery" : "No longer accepting applications"}</span>
              </div>
              <div className="bw-op-managed-actions">
                {["DRAFT", "PAUSED"].includes(o.status) && <button type="button" className="bw-op-managed-edit"
                  disabled={blocked} onClick={() => setEditor(o)}><NavigationIcon name="edit" size={16} />Edit</button>}
                {live && <Link className="bw-op-managed-view" to={`/opportunities/${o.id}`}>View listing<NavigationIcon name="chevron-right" size={15} /></Link>}
                {next && <button type="button" className={next === "PUBLISHED" ? "bw-op-primary bw-op-managed-publish" : "bw-op-secondary bw-op-managed-pause"}
                  disabled={blocked} onClick={() => void changeStatus(o, next)}>
                  <NavigationIcon name={next === "PUBLISHED" ? "play" : "pause"} size={16} />{actionLabel(next, o.status)}
                </button>}
                {secondary.length > 0 && <details className="bw-op-managed-more">
                  <summary aria-label={`More actions for ${o.title}`}><NavigationIcon name="more-horizontal" size={20} /></summary>
                  <div className="bw-op-managed-more-menu">
                    {secondary.map(action => <button key={action} type="button" disabled={blocked}
                      onClick={event => { event.currentTarget.closest("details").open = false; void changeStatus(o, action); }}>
                      {actionLabel(action, o.status)}
                    </button>)}
                  </div>
                </details>}
              </div>
            </div>
          </article>;
        })}
      </div>}
      {page.nextCursor && <div className="bw-op-dashboard-pagination">
        <span>Showing {visible.length} of {items.length} loaded listings</span>
        <button className="bw-op-secondary" type="button" disabled={busy || disabled || Boolean(error)}
          onClick={() => void load(page.nextCursor)}>Load more</button>
      </div>}
    </div>}
    {editor && !disabled && <OpportunityEditor key={editor.id || "new"} organizationId={organization.id}
      opportunity={editor.new ? null : editor} onClose={() => setEditor(null)}
      onSaved={o => {
        setEditor(null);
        setPage(old => ({ ...old, items: old.items.some(row => row.id === o.id)
          ? old.items.map(row => row.id === o.id ? o : row) : [o, ...old.items] }));
        clearFilters();
        setNotice("Draft saved. Publish it when you're ready.");
      }} />}
  </section>;
}
