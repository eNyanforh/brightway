import { useCallback, useEffect, useRef, useState, useId } from "react";
import { validStatistics } from "./management-statistics-data";
import { managementApi } from "../../api/management";
import WorkspaceIcon from "../workspace/WorkspaceIcon";
import "./management-statistics.css";

const number = value => new Intl.NumberFormat("en").format(value);
const timestamp = value => new Date(value).toLocaleString("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

export default function ManagementStatistics({ accountId }) {
  const [record, setSnapshot] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(null), life = useRef(null), chartId = useId();
  const load = useCallback(async current => {
    if (!current || life.current !== current || current.pending) return;
    current.pending = true; const controller = new AbortController(); current.controller = controller; setBusy(true); setError(null);
    try {
      const result = await managementApi.statistics(controller.signal);
      if (life.current !== current || controller.signal.aborted) return;
      if (!validStatistics(result, accountId)) throw Error("Platform statistics could not be verified. Please refresh.");
      setSnapshot(result);
    } catch (failure) { if (life.current === current && !controller.signal.aborted) { setSnapshot(null); setError(failure); } }
    finally { if (life.current === current) { current.pending = false; setBusy(false); } }
  }, [accountId]);
  useEffect(() => {
    const current = { pending: false, controller: null }; life.current = current;
    void Promise.resolve().then(() => load(current)); const focus = () => void load(current); window.addEventListener("focus", focus);
    return () => { current.controller?.abort(); if (life.current === current) life.current = null; window.removeEventListener("focus", focus); };
  }, [load]);
  const snapshot = record?.accountId === accountId ? record : null;
  const values = snapshot?.registrations || [], peak = Math.max(1, ...values.map(p => p.count)), registered = values.reduce((sum, p) => sum + p.count, 0);
  const points = values.map((p, i) => `${i * 580 / 29},${140 - p.count * 120 / peak}`).join(" ");
  return <section className="bw-platform-statistics" aria-label="Platform statistics" aria-busy={busy}>
    <header className="bw-platform-heading"><div><p>PLATFORM INTELLIGENCE</p><h2>Platform overview</h2><span>{snapshot ? <>Snapshot {timestamp(snapshot.asOf)} UTC</> : "Super Admin statistics"}</span></div><button type="button" onClick={() => void load(life.current)} disabled={busy} aria-label="Refresh platform statistics"><WorkspaceIcon name="refresh" size={16} /><span>{busy ? "Loading…" : "Refresh statistics"}</span></button></header>
    {!snapshot ? <div className="bw-platform-state">{error ? <><h3>Platform statistics unavailable</h3><p role="alert">{error.message}</p><p>Refresh to request a new authorized snapshot.</p></> : <p role="status">Loading platform totals…</p>}</div> : <>
      <div className="bw-platform-metrics">
        {[["Total users", snapshot.accounts.total, "All registered accounts, including staff", "people"], ["Active accounts", snapshot.accounts.active, "Account status, not current online activity", "check"], ["New users · 7 days", snapshot.accounts.newLast7Days, "Registered in the past seven days", "calendar"], ["Approved organizations", snapshot.organizations.total, "Includes active and suspended organizations", "building"]].map(([label, value, hint, icon]) => <article key={label}><span className="bw-platform-metric-icon"><WorkspaceIcon name={icon} size={20} /></span><p>{label}</p><strong>{number(value)}</strong><small>{hint}</small></article>)}
      </div>
      <div className="bw-platform-grid">
        <section className="bw-platform-growth" aria-labelledby={chartId}><div className="bw-platform-panel-title"><div><h3 id={chartId}>User registrations</h3><p>30 UTC calendar days · today is partial</p></div><strong>{number(registered)}<small>in this period</small></strong></div>
          <div className="bw-platform-chart" role="img" aria-label={`${number(registered)} registrations over 30 UTC days. Exact daily counts are available below.`}><span>{number(Math.max(0, ...values.map(p => p.count)))}</span><svg viewBox="0 0 580 150" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id={`${chartId}-fill`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#65adff" stopOpacity=".32" /><stop offset="1" stopColor="#65adff" stopOpacity="0" /></linearGradient></defs>{[20, 80, 140].map(y => <line key={y} x1="0" x2="580" y1={y} y2={y} stroke="#31465e" strokeDasharray="4 5" />)}<polygon points={`0,140 ${points} 580,140`} fill={`url(#${chartId}-fill)`} /><polyline points={points} fill="none" stroke="#8bc1ff" strokeWidth="2.5" vectorEffect="non-scaling-stroke" /></svg><div><span>{values[0].date}</span><span>{values.at(-1).date}</span></div></div>
          <details className="bw-platform-daily"><summary>View daily counts</summary><div><table><caption>Daily registrations (UTC)</caption><thead><tr><th scope="col">Date</th><th scope="col">New users</th></tr></thead><tbody>{values.map(point => <tr key={point.date}><th scope="row">{point.date}</th><td>{number(point.count)}</td></tr>)}</tbody></table></div></details>
        </section>
        <section className="bw-platform-panel"><h3>Account status</h3><p>All registered accounts by saved status.</p><dl>{[["Active", snapshot.accounts.active], ["Suspended", snapshot.accounts.suspended], ["Deactivated", snapshot.accounts.deactivated]].map(([label, value]) => <div key={label}><dt><i className={`status-${label.toLowerCase()}`} />{label}</dt><dd>{number(value)}</dd></div>)}</dl><p className="bw-platform-footnote">Active status does not mean an account is online or identity verified.</p></section>
        <section className="bw-platform-panel"><h3>Account security</h3><p>Counts across all registered accounts.</p><dl>{[["Verified email", snapshot.accounts.emailVerified], ["MFA enabled", snapshot.accounts.mfaEnabled], ["Signed in · past 7 days", snapshot.accounts.signedInLast7Days]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{number(value)}</dd></div>)}</dl><p className="bw-platform-footnote">Recent sign-ins use each account’s latest successful login; this is not an online-user count.</p></section>
        <section className="bw-platform-panel"><h3>Organizations</h3><p>Approved organization records.</p><dl>{[["Schools", snapshot.organizations.schools], ["Companies", snapshot.organizations.companies], ["NGOs", snapshot.organizations.ngos], ["Active", snapshot.organizations.active], ["Suspended", snapshot.organizations.suspended]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{number(value)}</dd></div>)}</dl></section>
        <section className="bw-platform-panel bw-platform-queues"><h3>Awaiting review</h3><p>Platform-wide saved queue states.</p><dl>{[["Organization requests", snapshot.queues.organizations], ["Identity requests", snapshot.queues.identities], ["Credential reviews", snapshot.queues.credentials]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{number(value)}</dd></div>)}</dl><p className="bw-platform-footnote">Submitted and in-review claims; organization requests also include assigned and recommended requests. Credential totals include BrightWay and issuer queues. Counts do not grant review access or establish verification eligibility.</p></section>
      </div>
    </>}
  </section>;
}
