import ManagementPageHeader from "../components/management/ManagementPageHeader";
import { ManagementQueue, ManagementQueueRow, ManagementReviewPlaceholder } from "../components/management/ManagementQueue";
import { subscribeFocus } from "../auth/focus-refresh";
import { useEffect, useRef, useState } from "react";
import { useManagement } from "../auth/management-context";
import { organizationsApi as api } from "../api/organizations";
import { identityDate } from "./manual-identity-format";
import "./organizations.css";
const checks = { existenceConfirmed: "Organization exists", locationConfirmed: "Operating location confirmed", authorityConfirmed: "Representative authority confirmed", typeConfirmed: "Organization type confirmed", operationalConfirmed: "Organization is operational" };
const empty = { existenceConfirmed: false, locationConfirmed: false, authorityConfirmed: false, typeConfirmed: false, operationalConfirmed: false, recommendation: "REJECT", notes: "", setupAssistance: "" };
export default function OrganizationReviewPage() {
  const { staff: account } = useManagement();
  return <OrganizationReview key={account?.id || "anonymous"} actor={account?.id} />;
}
function OrganizationReview({ actor }) {
  const [view, setView] = useState(null), [detail, setDetail] = useState(null), [report, setReport] = useState(empty), [agent, setAgent] = useState(""), [decision, setDecision] = useState("REJECT"), [reason, setReason] = useState("");
  const [error, setError] = useState(null), [busy, setBusy] = useState(false), [stale, setStale] = useState(false), [notice, setNotice] = useState("");
  const life = useRef(null), lock = useRef(false), selectedRef = useRef(null);
  const data = view?.actor === actor ? view.data : null, selected = detail?.actor === actor ? detail.data : null;
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => {
    const current = { actor, controller: null }; life.current = current; lock.current = false;
    async function load(preserveDraft = false) {
      current.controller?.abort(); const controller = new AbortController(); current.controller = controller;
      try {
        const queue = await api.queue(controller.signal);
        const previous = preserveDraft ? selectedRef.current : null;
        const checked = previous ? await api.detail(previous.id, controller.signal) : null;
        if (life.current === current && !controller.signal.aborted) {
          setView({ actor, data: queue }); setError(null);
          if (!preserveDraft) { setDetail(null); setReport(empty); setReason(""); setStale(false); }
          else if (checked && previous && (checked.version !== previous.version || checked.canDecide !== previous.canDecide || checked.canReport !== previous.canReport || checked.canAssign !== previous.canAssign || checked.requiresReassignment !== previous.requiresReassignment)) {
            setDetail({ actor, data: checked }); setStale(true);
          }
        }
      }
      catch (e) { if (life.current !== current || controller.signal.aborted || e.name === "AbortError") return; setError(e); if ([401, 403].includes(e.status)) { setView(null); setDetail(null); setReport(empty); setReason(""); setStale(true); } }
    }
    if (actor) void load();
    const focus = () => { if (!lock.current) void load(true); }; const unsubscribeFocus = subscribeFocus(focus);
    return () => { current.controller?.abort(); if (life.current === current) life.current = null; unsubscribeFocus(); };
  }, [actor]);
  async function action(work) {
    if (lock.current) return; lock.current = true; const current = life.current; current?.controller?.abort(); setBusy(true); setError(null); setNotice("");
    try { await work(current); }
    catch (e) { if (life.current === current) { setError(e); setStale(true); if ([401, 403].includes(e.status)) { setView(null); setDetail(null); setReport(empty); setReason(""); } } }
    finally { if (life.current === current) { lock.current = false; setBusy(false); } }
  }
  const reload = () => action(async current => { const queue = await api.queue(); if (life.current === current) { setView({ actor, data: queue }); setDetail(null); setReport(empty); setReason(""); setStale(false); } });
  async function mutate(method, body, current) {
    await api[method](selected.id, { expectedVersion: selected.version, ...body });
    if (life.current !== current) return;
    setStale(true); setDetail(null); setReport(empty); setReason(""); setNotice("Saved. Reload the organization queue for current status.");
    const queue = await api.queue(); if (life.current === current) { setView({ actor, data: queue }); setStale(false); }
  }
  return <section className="bw-org-page bw-mgmt-review-page">
    <ManagementPageHeader title="Organization review workspace" description="Investigate with care. A separate authorized approver makes the final organization decision." icon="building" action={<button type="button" disabled={busy} onClick={reload}>Reload organization queue</button>} />
    {error && <p role="alert">{error.message}</p>}{notice && <p role="status">{notice}</p>}{stale && <p>Reload before continuing. Unsubmitted feedback stays here while you still have access.</p>}
    {!data && !error && <p className="bw-mgmt-loading" role="status">Checking organization review access…</p>}
    <div className="bw-mgmt-review-desk"><div>{data && <ManagementQueue title="Organization requests" count={data.requests.length}>{!data.requests.length && <p>No organization requests in your queue.</p>}<ul className="bw-org-list">{data.requests.map(r => <ManagementQueueRow key={r.id} title={r.name} reference={`#${r.id.slice(0, 8)}`} status={r.status.replaceAll("_", " ")} meta={`Target ${identityDate(r.targetAt)}${r.overdue ? " · Past target" : ""}`} selected={selected?.id === r.id} disabled={busy} icon="building" onClick={() => action(async current => { const next = await api.detail(r.id); if (life.current === current) { setDetail({ actor, data: next }); setReport(empty); setAgent(""); setReason(""); setStale(false); } })} />)}</ul>
      {data.nextCursor && <button disabled={busy} onClick={() => action(async current => { const next = await api.queue(undefined, data.nextCursor); if (life.current === current) { setView({ actor, data: next }); setDetail(null); } })}>Next requests</button>}
    </ManagementQueue>}</div><div className="bw-mgmt-detail-panel">
    {selected ? <article><h2>{selected.name}</h2><p>Requested by @{selected.applicantUsername}, {selected.representativeRole}</p><p>{[selected.location.address, selected.location.city, selected.location.region, selected.location.countryCode].filter(Boolean).join(", ")}</p><p>{selected.type} · Offers training: {selected.offersTraining ? "Yes" : "No"} · Version {selected.version}</p>
      {selected.requiresReassignment && <p role="status">The investigating Agent is no longer authorized. Assign a replacement Agent and obtain fresh findings before deciding.</p>}
      {selected.canAssign && selected.status === "RECOMMENDED" && <p>Reassignment preserves the previous findings in private history and requires a new investigation. The original review target stays unchanged.</p>}
      {selected.canAssign && <form onSubmit={e => { e.preventDefault(); void action(current => mutate("assign", { agentUsername: agent }, current)); }}><label>{selected.status === "RECOMMENDED" ? "Replacement Agent username" : "Agent username"}<input required pattern="[a-zA-Z0-9_]{3,30}" value={agent} disabled={busy || stale} onChange={e => setAgent(e.target.value)} /></label><button disabled={busy || stale}>{selected.status === "RECOMMENDED" ? "Assign replacement Agent" : "Assign Agent"}</button></form>}
      {selected.canReport && <form onSubmit={e => { e.preventDefault(); void action(current => mutate("report", report, current)); }}><fieldset disabled={busy || stale}><legend>Agent findings</legend>{Object.entries(checks).map(([key, label]) => <label key={key} className="bw-org-check"><input type="checkbox" checked={report[key]} onChange={e => setReport(old => ({ ...old, [key]: e.target.checked }))} />{label}</label>)}
        <label>Recommendation<select aria-label="Recommendation" value={report.recommendation} onChange={e => setReport(old => ({ ...old, recommendation: e.target.value }))}><option value="REJECT">Recommend rejection</option><option value="APPROVE">Recommend approval</option></select></label>
        <label>Private verification notes<textarea required minLength={10} maxLength={4000} value={report.notes} onChange={e => setReport(old => ({ ...old, notes: e.target.value }))} /></label>
        <label>Setup assistance notes (optional)<textarea maxLength={2000} value={report.setupAssistance} onChange={e => setReport(old => ({ ...old, setupAssistance: e.target.value }))} /></label></fieldset>
        <button disabled={busy || stale || report.recommendation === "APPROVE" && !Object.keys(checks).every(key => report[key])}>Submit Agent recommendation</button></form>}
      {selected.finding && <section><h3>Recorded Agent findings</h3><ul>{Object.entries(checks).map(([key, label]) => <li key={key}>{selected.finding[key] ? "Confirmed" : "Not confirmed"} — {label}</li>)}</ul><p>{selected.finding.recommendation}</p><p>{selected.finding.notes}</p>{selected.finding.setupAssistance && <p>{selected.finding.setupAssistance}</p>}</section>}
      {!!selected.findingHistory?.length && <section><h3>Previous investigations</h3><p>These findings are retained for review history and cannot authorize the current decision. Showing the latest ten investigations.</p>{selected.findingHistory.map(entry => <article key={entry.id}><h4>Request version {entry.sourceVersion} · {entry.recommendation}</h4><p>Recorded {identityDate(entry.createdAt)} · Replaced {identityDate(entry.retiredAt)}</p><ul>{Object.entries(checks).map(([key, label]) => <li key={key}>{entry[key] ? "Confirmed" : "Not confirmed"} — {label}</li>)}</ul><p>{entry.notes}</p>{entry.setupAssistance && <p>{entry.setupAssistance}</p>}</article>)}</section>}
      {selected.canDecide && <form onSubmit={e => { e.preventDefault(); void action(current => mutate("decide", { decision, reason }, current)); }}><label>Final organization decision<select aria-label="Final organization decision" disabled={busy || stale} value={decision} onChange={e => setDecision(e.target.value)}><option value="REJECT">Reject</option><option value="APPROVE" disabled={selected.finding?.recommendation !== "APPROVE"}>Approve</option></select></label><label>Feedback shown to the requester<textarea required minLength={10} maxLength={2000} disabled={busy || stale} value={reason} onChange={e => setReason(e.target.value)} /></label><button disabled={busy || stale}>Save organization decision</button></form>}
    </article> : <ManagementReviewPlaceholder title="Build trust from the start" description="Select an organization request to view the application, assign an Agent and review the investigation." />}</div></div>
  </section>;
}
