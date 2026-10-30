import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { credentialsApi } from "../api/credentials";
import { credentialLabels } from "./credential-form";
import { ReviewDetail, ReviewIcon, ReviewStatus } from "../components/credentials/ReviewDetail";
import { applicantName, reviewDate } from "../components/credentials/review-presentation";
import "./credential-reviews.css";
const initialDecision = "ACTION_REQUIRED", openStatuses = new Set(["SUBMITTED", "IN_REVIEW"]);
export default function CredentialReviewsPage() {
  const { account } = useAuth(), { organizationId } = useParams(), [params] = useSearchParams();
  return <ReviewWorkspace key={`${account?.id}:${organizationId || "brightway"}:${params.toString()}`} accountId={account?.id} organizationId={organizationId} />;
}
function ReviewWorkspace({ accountId, organizationId }) {
  const [params, setParams] = useSearchParams();
  const statusFilter = organizationId ? params.get("status") : null, attentionFilter = organizationId ? params.get("filter") : null;
  const filters = useMemo(() => ({ ...(statusFilter ? { status: statusFilter } : {}), ...(attentionFilter ? { filter: attentionFilter } : {}) }), [statusFilter, attentionFilter]);
  const api = useMemo(() => credentialsApi.inOrganization(organizationId), [organizationId]), setActing = useOutletContext()?.setActingOrganization;
  const [queue, setQueue] = useState(null), [detail, setDetail] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false), [stale, setStale] = useState(false);
  const [note, setNote] = useState(""), [decision, setDecision] = useState(initialDecision), [search, setSearch] = useState(""), [notice, setNotice] = useState(""), [pages, setPages] = useState([null]), [names, setNames] = useState({});
  const lock = useRef(false), life = useRef(null), selected = useRef(null), cursors = useRef([null]), detailHeading = useRef(null);
  const dirty = !!note.trim() || decision !== initialDecision;
  const readQueue = useCallback(async (cursor, signal) => {
    const next = await api.queue(cursor, signal, filters);
    if (!Array.isArray(next.reviews)) throw new Error("The review queue could not be read. Reload reviews to try again.");
    if (organizationId && next.organization && next.organization.id !== organizationId) throw Object.assign(new Error("This queue does not belong to the selected organization."), { status: 403 });
    if (next.reviews.some(row => row.issuerOrganizationId !== undefined && row.issuerOrganizationId !== (organizationId || null))) throw Object.assign(new Error("The review queue changed organization scope."), { status: 403 });
    return next;
  }, [api, filters, organizationId]);
  const readDetail = useCallback(async (id, signal) => {
    const next = await api.detail(id, signal);
    if (!next.review || next.review.id !== id || (next.review.issuerOrganizationId !== undefined && next.review.issuerOrganizationId !== (organizationId || null))) throw Object.assign(new Error("This review is not available in the selected workspace."), { status: 403 });
    return next;
  }, [api, organizationId]);
  const publishQueue = useCallback(next => {
    setNames(previous => ({ ...previous, ...Object.fromEntries(next.reviews.map(row => [row.id, applicantName(row)])) }));
    setQueue(next);
    if (organizationId && next.organization) setActing?.({ accountId, organization: next.organization, workspace: next.workspace });
  }, [accountId, organizationId, setActing]);
  const failure = useCallback((e, reconcile = true) => {
    setError(e); if (reconcile) setStale(true);
    if ([401, 403, 404].includes(e.status)) { setQueue(null); setDetail(null); selected.current = null; setNote(""); setDecision(initialDecision); setNames({}); setActing?.(null); }
  }, [setActing]);
  useEffect(() => {
    const current = { controller: null }; life.current = current;
    async function load(preserve = false) {
      if (lock.current) return;
      current.controller?.abort(); const controller = new AbortController(); current.controller = controller;
      try {
        const next = await readQueue(cursors.current.at(-1), controller.signal);
        if (controller.signal.aborted || life.current !== current) return;
        publishQueue(next);
        if (preserve && selected.current) {
          const fresh = await readDetail(selected.current.id, controller.signal);
          if (controller.signal.aborted || life.current !== current) return;
          if (fresh.review.version !== selected.current.version) { failure(Object.assign(new Error("This review changed. Reload reviews before continuing. Your reason is still here."), { status: 409 })); return; }
          setDetail(fresh);
        }
        // Background success cannot reconcile an uncertain write or discard a stale draft.
        setError(previous => preserve ? previous : null);
      } catch (e) { if (!controller.signal.aborted && life.current === current) failure(e); }
    }
    void load(); const focus = () => void load(true); window.addEventListener("focus", focus);
    return () => { current.controller?.abort(); if (life.current === current) life.current = null; setActing?.(null); window.removeEventListener("focus", focus); };
  }, [readQueue, readDetail, publishQueue, failure, setActing]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const guard = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard); return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, busy]);
  const reviewId = detail?.review.id;
  useEffect(() => { if (reviewId) detailHeading.current?.focus(); else document.querySelector(".bw-review-directory h2")?.focus(); }, [reviewId]);
  function discard() { return !dirty || window.confirm("Discard this unsaved decision reason and choice?"); }
  function resetDecision() { setNote(""); setDecision(initialDecision); }
  async function action(work) {
    if (lock.current) return;
    lock.current = true; const current = life.current; current?.controller?.abort(); setBusy(true); setError(null); setNotice("");
    const valid = () => life.current === current;
    const show = value => { if (valid()) { setDetail(value); selected.current = value.review; } };
    try { await work(valid, show); } catch (e) { if (valid()) failure(e); }
    finally { if (valid()) { lock.current = false; setBusy(false); } }
  }
  function open(id) {
    if (lock.current || stale || selected.current?.id === id || !discard()) return;
    void action(async (valid, show) => { selected.current = null; setDetail(null); resetDecision(); const next = await readDetail(id); if (valid()) show(next); });
  }
  function reload() {
    if (lock.current || !discard()) return;
    void action(async (valid, show) => {
      const next = await readQueue(cursors.current.at(-1)), latest = selected.current ? await readDetail(selected.current.id) : null;
      if (valid()) { publishQueue(next); if (latest) show(latest); resetDecision(); setStale(false); setNotice("Reviews are up to date."); }
    });
  }
  function changeFilter(next) { if (!lock.current && discard()) setParams(next); }
  function turnPage(back = false) {
    if (lock.current || stale || !discard()) return;
    const next = back ? cursors.current.slice(0, -1) : [...cursors.current, queue.nextCursor];
    void action(async valid => { const list = await readQueue(next.at(-1)); if (valid()) { publishQueue(list); cursors.current = next; setPages(next); selected.current = null; setDetail(null); resetDecision(); setSearch(""); } });
  }
  function assign() {
    if (stale || lock.current || !detail) return;
    const review = detail.review;
    void action(async (valid, show) => { await api.assign(review.id, review.version); const next = await readDetail(review.id), list = await readQueue(cursors.current.at(-1)); if (valid()) { show(next); publishQueue(list); resetDecision(); setNotice("Review assigned to you. You can now check the supporting documents."); } });
  }
  function saveDecision() {
    if (stale || lock.current || !detail || note.trim().length < 10) return;
    const review = detail.review;
    void action(async (valid, show) => {
      await api.decide(review.id, { expectedVersion: review.version, revision: review.revision, status: decision, note });
      const next = await readDetail(review.id), list = await readQueue(cursors.current.at(-1));
      if (valid()) { show(next); publishQueue(list); resetDecision(); setNotice("Review decision saved. The applicant can read your feedback."); }
    });
  }
  const rows = queue?.reviews || [], visible = rows.filter(row => `${applicantName(row)} ${row.profile?.person?.account?.username || ""} ${row.kind}`.toLowerCase().includes(search.trim().toLowerCase()));
  const overdue = rows.filter(row => row.overdue && openStatuses.has(row.status)).length;
  const currentFilter = statusFilter ? credentialLabels[statusFilter] || "Requested filter" : attentionFilter === "unassigned" ? "Unassigned submissions" : attentionFilter === "past_target" ? "Open reviews past the seven-day target" : null;
  const name = rows.find(row => row.id === detail?.review.id);
  const management = useOutletContext()?.management;
  return <section className="bw-review-workspace" aria-label="Credential review workspace">
    <header className="bw-review-page-header"><nav aria-label="Review workspace breadcrumb"><Link to={management ? "/superadmin" : organizationId ? "/work" : "/profile"}>{management ? "Management" : organizationId ? "My Workspace" : "My profile"}</Link><span>/</span>{organizationId && <><Link to={`/organization-workspace/${organizationId}`}>{queue?.organization?.name || "Organization"}</Link><span>/</span></>}<span>Credential Review</span></nav>
      <div className="bw-review-page-title"><div className="bw-review-title-icon"><ReviewIcon name="shield" size={25} /></div><div><p>{organizationId ? queue?.organization?.name || "ORGANIZATION WORKSPACE" : "BRIGHTWAY REVIEW TEAM"}</p><h1>Credential Review</h1><span>Careful review. Credible achievements.</span></div><button type="button" className="bw-review-refresh bw-review-secondary" disabled={busy} onClick={reload} aria-label="Reload reviews"><ReviewIcon name="refresh" /><span>{busy ? "Working…" : "Refresh"}</span></button></div>
    </header>
    <div className="bw-review-policy"><ReviewIcon name="shield" /><p>{organizationId ? "Review only claims submitted to your organization." : "BrightWay reviews claims submitted for unlisted issuers."} <span>Credential decisions are separate from individual identity verification.</span></p><span className="bw-review-private"><ReviewIcon name="lock" size={13} />Private workspace</span></div>
    {error && <div className="bw-review-alert" role="alert"><ReviewIcon name="alert" /><div><strong>Review access or information needs attention</strong><p>{error.message}</p>{stale && queue && <p>Your draft is kept. Reload reviews before assigning, deciding or downloading evidence.</p>}{error.status === 403 && <Link to="/security">Open Account security</Link>}</div></div>}
    {notice && <p className="bw-review-notice" role="status"><ReviewIcon name="check" />{notice}</p>}
    {!queue ? <div className="bw-review-state" role={error ? undefined : "status"}><ReviewIcon name={error ? "lock" : "inbox"} size={38} /><h2>{error ? "Review queue unavailable" : "Checking reviewer access…"}</h2><p>{error ? "Your account needs current review permission and two-factor authentication. Refresh after access is restored." : "Loading the claims you are authorized to review."}</p></div> : <>
      <div className="bw-review-page-summary"><span><strong>{rows.length}</strong> reviews on this page</span><span><i className="bw-review-dot blue" />{rows.filter(row => row.status === "SUBMITTED").length} submitted</span><span><i className="bw-review-dot amber" />{rows.filter(row => row.status === "IN_REVIEW").length} in review</span><span><i className="bw-review-dot red" />{overdue} open past target</span><small>Page {pages.length} · Oldest submissions first</small></div>
      {organizationId && <div className="bw-review-filters"><div className="bw-review-quick-filters" aria-label="Review queue filters">{[["all", "All reviews", {}], ["unassigned", "Unassigned", { filter: "unassigned" }], ["IN_REVIEW", "In review", { status: "IN_REVIEW" }], ["past_target", "Past target", { filter: "past_target" }]].map(([key, label, query]) => <button key={key} type="button" aria-pressed={key === (statusFilter || attentionFilter || "all")} disabled={busy} onClick={() => changeFilter(query)}>{label}</button>)}</div><label className="bw-review-status-filter">Status<select aria-label="Filter by review status" value={statusFilter || ""} disabled={busy} onChange={event => changeFilter(event.target.value ? { status: event.target.value } : {})}><option value="">All statuses</option>{["SUBMITTED", "IN_REVIEW", "ACTION_REQUIRED", "VERIFIED", "UNABLE_TO_VERIFY", "FALSE_CREDENTIAL"].map(value => <option key={value} value={value}>{credentialLabels[value]}</option>)}</select></label></div>}
      {currentFilter && <div className="bw-review-filter-note"><p>Showing: {currentFilter}.</p><button type="button" className="bw-review-text-button" disabled={busy} onClick={() => changeFilter({})}>Clear review filter</button></div>}
      <div className={`bw-review-workbench${detail ? " is-open" : ""}`}>
        <aside className="bw-review-directory" aria-label="Credential submission queue"><header><div><h2 tabIndex={-1}>Submission queue</h2><span>{visible.length} of {rows.length} loaded</span></div><label className="bw-review-search"><ReviewIcon name="search" /><input aria-label="Search applicants on this page" placeholder="Search this page…" maxLength={100} value={search} disabled={busy} onChange={event => setSearch(event.target.value)} /></label><small>Search applies to this page of results.</small></header>
          {!visible.length ? <div className="bw-review-queue-empty"><ReviewIcon name="inbox" size={31} /><h3>{search.trim() ? "No matching applicants" : "Your queue is clear"}</h3><p>{search.trim() ? "Try another name or clear the page search." : "No credential submissions match this view."}</p></div> : <ul className="bw-review-list">{visible.map(item => <li key={item.id}><button type="button" className={item.id === detail?.review.id ? "is-selected" : ""} aria-pressed={item.id === detail?.review.id} disabled={busy || stale} onClick={() => open(item.id)}><span className="bw-review-row-symbol"><ReviewIcon name={item.kind === "education" ? "education" : "work"} size={20} /></span><span className="bw-review-row-content"><strong>{applicantName(item)}</strong><span>{item.kind === "education" ? "Education" : "Experience"} <i>·</i> Revision {item.revision}</span><ReviewStatus status={item.status} /><small>{reviewDate(item.initialSubmittedAt)}{item.overdue && openStatuses.has(item.status) && <em>Past review target</em>}</small></span><ReviewIcon name="arrow" size={16} /></button></li>)}</ul>}
          <footer><span>Page {pages.length}</span><button type="button" className="bw-review-text-button" disabled={busy || stale || pages.length < 2} onClick={() => turnPage(true)}>Previous page</button><button type="button" className="bw-review-text-button" disabled={busy || stale || !queue.nextCursor} onClick={() => turnPage()}>Next page</button></footer>
        </aside>
        <section className="bw-review-detail-region" aria-label="Selected credential review">{detail ? <ReviewDetail key={`${detail.review.id}:${detail.review.version}`} detail={detail} name={name ? applicantName(name) : names[detail.review.id] || (detail.username ? `@${detail.username}` : "Applicant")} accountId={accountId} headingRef={detailHeading} busy={busy} stale={stale} decision={decision} note={note} onNote={setNote} onDecision={setDecision} onAssign={assign} onSave={saveDecision} onError={failure} isBusy={() => lock.current} onClose={() => { if (!lock.current && discard()) { selected.current = null; setDetail(null); resetDecision(); } }} /> : <div className="bw-review-select-state" role={busy ? "status" : undefined}><span><ReviewIcon name="document" size={38} /></span><p className="bw-review-eyebrow">A CLEARER PICTURE</p><h2>{busy ? "Opening review…" : "Every achievement deserves a careful review"}</h2><p>Select a submission to see the saved claim, check its supporting documents and record a clear decision.</p><ol><li><ReviewIcon name="person" />Assign the review to yourself</li><li><ReviewIcon name="document" />Check the submitted evidence</li><li><ReviewIcon name="check" />Give the applicant clear feedback</li></ol></div>}</section>
      </div>
    </>}
  </section>;
}
