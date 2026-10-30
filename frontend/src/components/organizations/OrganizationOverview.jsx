import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { readOrganizationDashboard } from "../../api/organization-dashboard";
import WorkspaceIcon from "../workspace/WorkspaceIcon";
import "./organization-dashboard.css";

const number = value => new Intl.NumberFormat("en").format(value);
const dateLabel = value => new Date(value + "T00:00:00Z").toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });
const reasons = {
  permission_required: "Requires the relevant organization permission.",
  mfa_required: "Sign in with two-factor authentication to see these statistics.",
  email_required: "Verify your account email to see these statistics.",
};
const outcomeLabels = { VERIFIED: "Verified", UNABLE_TO_VERIFY: "Unable to verify", FALSE_CREDENTIAL: "False credential" };

function Metric({ label, value, caption, access, icon, tone = "blue" }) {
  return <section className={`bw-analytics-metric bw-analytics-metric-${tone}`} aria-label={label}>
    <div className="bw-analytics-metric-top"><h3>{label}</h3><span><WorkspaceIcon name={icon} size={19} /></span></div>
    {access === "allowed" ? <><strong>{number(value)}</strong><p>{caption}</p></> : <><strong className="bw-analytics-restricted">{access === "permission_required" ? "Restricted" : "Locked"}</strong><p>{reasons[access]}</p></>}
  </section>;
}

function Trend({ reviews, period }) {
  const chart = useRef(null), [width, setWidth] = useState(630);
  const activity = reviews.newClaims + reviews.completedClaims > 0;
  useEffect(() => {
    if (!activity || typeof ResizeObserver !== "function" || !chart.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(220, Math.round(entry.contentRect.width))));
    observer.observe(chart.current); return () => observer.disconnect();
  }, [activity]);
  const points = reviews.trend, peak = Math.max(4, Math.ceil(Math.max(...points.flatMap(p => [p.submissions, p.decisions])) / 4) * 4);
  const x = index => 45 + (index / Math.max(1, points.length - 1)) * (width - 65);
  const y = value => 174 - (value / peak) * 145;
  const path = field => points.map((point, index) => `${index ? "L" : "M"}${x(index)},${y(point[field])}`).join(" ");
  return <section className="bw-analytics-panel bw-analytics-trend" aria-labelledby="dashboard-trend-title">
    <header className="bw-analytics-panel-heading"><div><h3 id="dashboard-trend-title">Review activity</h3><p>New claims and completed claims · {period.bucketDays === 7 ? "7-day buckets" : "Daily"} · UTC</p></div><span className="bw-analytics-period-tag">{period.days} days</span></header>
    <div className="bw-analytics-trend-totals"><div><span className="bw-analytics-legend bw-analytics-legend-blue">New claims</span><strong>{number(reviews.newClaims)}</strong></div><div><span className="bw-analytics-legend bw-analytics-legend-teal">Completed claims</span><strong>{number(reviews.completedClaims)}</strong></div></div>
    {activity ? <div ref={chart} className="bw-analytics-chart"><svg viewBox={`0 0 ${width} 215`} role="img" aria-label={`Review activity for the last ${period.days} days. ${reviews.newClaims} new claims and ${reviews.completedClaims} completed claims. Exact values are available in View chart data.`}>
      {[0, 1, 2, 3, 4].map(tick => <g key={tick}><line x1="45" x2={width - 20} y1={y(peak * tick / 4)} y2={y(peak * tick / 4)} className="bw-analytics-gridline" /><text x="32" y={y(peak * tick / 4) + 4} textAnchor="end">{number(peak * tick / 4)}</text></g>)}
      <path d={path("submissions")} className="bw-analytics-line bw-analytics-line-blue" />
      <path d={path("decisions")} className="bw-analytics-line bw-analytics-line-teal" />
      {points.map((point, index) => <g key={point.date}><circle cx={x(index)} cy={y(point.submissions)} r="3" className="bw-analytics-dot-blue"><title>{dateLabel(point.date)}: {point.submissions} new claims</title></circle><rect x={x(index) - 2.5} y={y(point.decisions) - 2.5} width="5" height="5" rx="1" className="bw-analytics-dot-teal"><title>{dateLabel(point.date)}: {point.decisions} completed claims</title></rect></g>)}
      {[0, Math.floor((points.length - 1) / 2), points.length - 1].map(index => <text key={index} x={x(index)} y="202" textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}>{dateLabel(points[index].date)}</text>)}
    </svg></div> : <div className="bw-analytics-chart-empty"><WorkspaceIcon name="clock" size={27} /><strong>No review activity in this period</strong><p>New submissions and final decisions will appear here.</p></div>}
    <details className="bw-analytics-chart-data"><summary>View chart data</summary><div><table><caption>Review activity · UTC · {period.bucketDays === 7 ? "Bucket starting on" : "Date"}</caption><thead><tr><th scope="col">Date</th><th scope="col">New claims</th><th scope="col">Completed claims</th></tr></thead><tbody>{points.map(point => <tr key={point.date}><th scope="row">{dateLabel(point.date)}</th><td>{number(point.submissions)}</td><td>{number(point.decisions)}</td></tr>)}</tbody></table></div></details>
    <p className="bw-analytics-footnote">Completed claims had a final decision in this period; later corrections can reopen them. Each claim counts once per period, using its latest final decision. New claims and completions are different cohorts, not a conversion rate.</p>
  </section>;
}

function Attention({ data, organizationId }) {
  const review = data.reviews.access === "allowed" ? data.reviews.data : null, team = data.team.access === "allowed" ? data.team.data : null;
  const base = `/organization-workspace/${organizationId}`;
  const items = [
    ...(review ? [{ label: "Unassigned submissions", value: review.unassigned, caption: "Waiting for a reviewer", icon: "mail", to: `${base}/credentials?filter=unassigned` }, { label: "Past review target", value: review.pastTarget, caption: "Open at least seven days", icon: "clock", to: `${base}/credentials?filter=past_target` }] : []),
    ...(team ? [{ label: "Invitations expiring soon", value: team.expiringInvitations, caption: "Within the next two days", icon: "alert", to: `${base}/staff` }] : []),
  ];
  return <section className="bw-analytics-panel bw-analytics-attention" aria-labelledby="dashboard-attention-title"><header className="bw-analytics-panel-heading"><div><h3 id="dashboard-attention-title">Needs attention</h3><p>Current items in your access</p></div><WorkspaceIcon name="alert" size={19} /></header>
    {!items.length ? <p className="bw-analytics-blocked">No workload statistics are available to your current access.</p> : <><ul>{items.map(item => <li key={item.label}><span className="bw-analytics-attention-icon"><WorkspaceIcon name={item.icon} size={18} /></span><div>{item.value > 0 ? <Link to={item.to}>{item.label}<WorkspaceIcon name="arrow" size={14} /></Link> : <span>{item.label}</span>}<small>{item.caption}</small></div><strong>{number(item.value)}</strong></li>)}</ul>{items.every(item => item.value === 0) && <p className="bw-analytics-clear"><WorkspaceIcon name="check" size={15} />No items need attention in this scope.</p>}<p className="bw-analytics-footnote">Attention categories may overlap.</p></>}
  </section>;
}

export default function OrganizationOverview({ organization, role, refreshVersion = "" }) {
  const [days, setDays] = useState(30), [retry, setRetry] = useState(0), [result, setResult] = useState(null);
  const source = `${organization.id}:${days}:${refreshVersion}:${retry}`;
  useEffect(() => {
    let controller, disposed = false;
    async function load() {
      controller?.abort(); controller = new AbortController(); const signal = controller.signal;
      setResult({ source, loading: true });
      try { const data = await readOrganizationDashboard(organization.id, days, signal); if (!signal.aborted && !disposed) setResult({ source, data }); }
      catch (error) { if (!signal.aborted && !disposed && error.name !== "AbortError") setResult({ source, error }); }
    }
    void Promise.resolve().then(() => { if (!disposed) return load(); });
    const focus = () => { if (!disposed) void load(); }; window.addEventListener("focus", focus);
    return () => { disposed = true; controller?.abort(); window.removeEventListener("focus", focus); };
  }, [organization.id, days, source]);
  const current = result?.source === source ? result : null, data = current?.data, error = current?.error;
  const review = data?.reviews.access === "allowed" ? data.reviews.data : null, team = data?.team.access === "allowed" ? data.team.data : null;
  const blocked = data && [data.team, data.reviews].some(block => ["mfa_required", "email_required"].includes(block.access));
  const noScope = data && data.team.access === "permission_required" && data.reviews.access === "permission_required";
  return <div className="bw-analytics" aria-label="Dashboard analytics">
    <header className="bw-analytics-heading"><div><p className="bw-dashboard-eyebrow">ORGANIZATION ANALYTICS</p><h2>Dashboard</h2><p>Your team and review workload, at a glance.</p></div><label className="bw-analytics-range">Reporting period<select value={days} onChange={event => setDays(Number(event.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label></header>
    {(!current || current.loading) && <div className="bw-analytics-loading" role="status"><p>Loading organization statistics…</p><div aria-hidden="true"><span /><span /><span /><span /></div></div>}
    {error && <div className="bw-analytics-error"><p role="alert">{error.message}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Retry statistics</button>{[401, 403].includes(error.status) && <Link to="/security">Account security</Link>}</div>}
    {data && <>
      <div className="bw-analytics-snapshot"><span className="bw-analytics-role"><WorkspaceIcon name="shield" size={14} />{role === "PRIMARY_ADMIN" ? "Primary administrator" : "Staff member"}</span><span>Snapshot: {new Date(data.asOf).toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC</span></div>
      {blocked && <div className="bw-analytics-access-notice"><WorkspaceIcon name="shield" size={20} /><p>Sensitive statistics are locked. Verify your email and sign in with two-factor authentication.</p><Link to="/security">Account security<WorkspaceIcon name="arrow" size={15} /></Link></div>}
      {noScope ? <section className="bw-analytics-panel bw-analytics-no-scope"><WorkspaceIcon name="shield" size={32} /><h3>Analytics access is limited</h3><p>Your current role does not include team management or credential review. Ask your organization administrator if you need access to these statistics.</p></section> : <>
        <div className="bw-analytics-metrics">
          <Metric label="Enabled members" value={team?.enabledMembers} access={data.team.access} caption="Current access · includes administrators" icon="building" />
          <Metric label="Pending invitations" value={team?.pendingInvitations} access={data.team.access} caption="Current · unexpired invitations only" icon="mail" tone="violet" />
          <Metric label="Open reviews" value={review ? review.current.SUBMITTED + review.current.IN_REVIEW : undefined} access={data.reviews.access} caption="Current · awaiting or in review" icon="clock" tone="amber" />
          <Metric label="Completed claims" value={review?.completedClaims} access={data.reviews.access} caption={`Unique claims · last ${days} days`} icon="check" tone="teal" />
        </div>
        <div className="bw-analytics-main-grid">{review ? <Trend reviews={review} period={data.period} /> : <section className="bw-analytics-panel bw-analytics-blocked"><WorkspaceIcon name="shield" size={28} /><h3>Review analytics unavailable</h3><p>{reasons[data.reviews.access]}</p></section>}<Attention data={data} organizationId={organization.id} /></div>
        {review && <div className="bw-analytics-bottom-grid"><section className="bw-analytics-panel" aria-labelledby="dashboard-workload-title"><header className="bw-analytics-panel-heading"><div><h3 id="dashboard-workload-title">Current workload</h3><p>Current snapshot · all time</p></div><WorkspaceIcon name="clock" size={18} /></header><dl className="bw-analytics-status-list">{[["SUBMITTED", "Awaiting review"], ["IN_REVIEW", "In review"], ["ACTION_REQUIRED", "Awaiting applicant corrections"]].map(([status, label]) => <div key={status}><dt><span className={`bw-analytics-status-dot bw-analytics-status-${status}`} />{label}</dt><dd>{number(review.current[status])}</dd></div>)}</dl><p className="bw-analytics-footnote">Waiting for applicant corrections is separate from work waiting on a reviewer.</p></section>
          <section className="bw-analytics-panel" aria-labelledby="dashboard-outcomes-title"><header className="bw-analytics-panel-heading"><div><h3 id="dashboard-outcomes-title">Review outcomes</h3><p>Latest final decision per claim · last {days} days</p></div><WorkspaceIcon name="check" size={18} /></header><dl className="bw-analytics-outcomes">{Object.entries(outcomeLabels).map(([status, label]) => <div key={status}><dt>{label}</dt><dd><strong>{number(review.outcomes[status])}</strong><span className="bw-analytics-outcome-track" aria-hidden="true"><span className={`bw-analytics-outcome-${status}`} style={{ width: `${review.completedClaims ? review.outcomes[status] / review.completedClaims * 100 : 0}%` }} /></span></dd></div>)}</dl><p className="bw-analytics-footnote">Median time to final decision: {review.medianHours === null ? "Not available yet" : `${number(review.medianHours)} hours`}. Includes time awaiting corrections.</p></section></div>}
        {review && <p className="bw-analytics-scope-note"><WorkspaceIcon name="shield" size={15} />{data.reviews.kinds.map(kind => kind === "education" ? "Education" : "Experience").join(" and ")} claims submitted to this organization, within your review permissions. Your own claims are excluded.</p>}
      </>}
    </>}
  </div>;
}
