import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useOutlet, useOutletContext } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { managementApi } from "../api/management";
import { managementPath } from "../components/layout/management-paths";
import ManagementStatistics from "../components/management/ManagementStatistics";
import WorkspaceIcon from "../components/workspace/WorkspaceIcon";
import "./management.css";
const routes = new Set(["/admin/credentials", "/admin/manual-identity", "/admin/profile-photos", "/admin/name-changes", "/admin/organizations"]);
const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) : "Not available";
export default function ManagementPage() { const { account, logout } = useAuth(); return <ManagementWorkspace key={account?.id} accountId={account?.id} logout={logout} />; }
function ManagementWorkspace({ accountId, logout }) {
  const outer = useOutletContext(), setWorkspace = outer?.setManagementWorkspace;
  const { pathname } = useLocation();
  useEffect(() => { const title = document.title; document.title = "BrightWay Management"; return () => { document.title = title; }; }, []);
  const [data, setData] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false), life = useRef(null);
  const load = useCallback(async current => {
    if (!current || life.current !== current || current.pending) return;
    current.pending = true; current.controller?.abort(); const controller = new AbortController(); current.controller = controller; setBusy(true); setError(null);
    try {
      const next = await managementApi.context(controller.signal);
      if (life.current !== current || controller.signal.aborted) return;
      if (next.allowed !== true || next.accountId !== accountId || !next.role || !Array.isArray(next.tools) || !Array.isArray(next.audits) || next.tools.some(tool => typeof tool.allowed !== "boolean" || !routes.has(tool.to))) throw new Error("Management context could not be verified for this account.");
      setData(next); setWorkspace?.(next);
    } catch (e) { if (life.current === current && !controller.signal.aborted) { setData(null); setWorkspace?.(null); setError(e); } }
    finally { if (life.current === current) { current.pending = false; setBusy(false); } }
  }, [accountId, setWorkspace]);
  useEffect(() => {
    const current = { pending: false, controller: null }; life.current = current;
    void Promise.resolve().then(() => load(current)); const focus = () => void load(current); window.addEventListener("focus", focus);
    return () => { current.controller?.abort(); if (life.current === current) life.current = null; setWorkspace?.(null); window.removeEventListener("focus", focus); };
  }, [load, setWorkspace]);
  const child = useOutlet({ ...outer, management: data });
  const authorizedChild = !child || data?.tools.some(tool => tool.allowed === true && managementPath(tool.to) === pathname);
  return <section className="bw-management" aria-label="BrightWay management workspace">
    <header className="bw-management-header"><div className="bw-management-brand"><WorkspaceIcon name="shield" size={27} /></div><div><p>BRIGHTWAY / CONTROL CENTER</p><h1>BrightWay Management</h1><span>Clear authority. Protected operations. Accountable decisions.</span></div><button type="button" className="bw-management-refresh" aria-label="Refresh management access" disabled={busy} onClick={() => void load(life.current)}><WorkspaceIcon name="refresh" size={17} /><span>{busy ? "Checking…" : "Refresh"}</span></button></header>
    {!data ? <div className="bw-management-empty"><WorkspaceIcon name="shield" size={34} /><h2>{error ? "Management access unavailable" : "Checking management access…"}</h2>{error ? <><p role="alert">{error.message}</p><p>Use an active, email-verified account with management access and sign in with MFA after the grant.</p>{logout && <button type="button" className="bw-management-refresh" onClick={async () => { try { await logout(); } catch (failure) { setError(failure); } }}>Sign out</button>}<Link to="/security">Account security</Link></> : <p role="status">Checking your current account, permission and MFA session.</p>}</div> : child ? authorizedChild ? <div className="bw-management-operational">{child}</div> : <div className="bw-management-empty"><h2>Permission required</h2><p role="alert">Your account is not assigned to this operational workspace.</p><Link to="/superadmin">Return to Management</Link></div> : <>
      <div className="bw-management-identity"><div><span className="bw-management-role">{data.role.label}</span><h2>Welcome, {data.fullName || data.username}</h2><p>@{data.username} · Access granted {date(data.role.grantedAt)} UTC</p></div><Link to="/security">Account security <WorkspaceIcon name="arrow" size={16} /></Link></div>
      <div className="bw-management-security" aria-label="Management access checks"><span><WorkspaceIcon name="check" size={16} />Active management permission</span><span><WorkspaceIcon name="check" size={16} />Verified email</span><span><WorkspaceIcon name="check" size={16} />Current MFA sign-in</span></div>
      {data.role.isSuperAdmin === true && <ManagementStatistics key={`${accountId}:${data.role.version}`} accountId={accountId} />}
      {data.role.isSuperAdmin === true && <section className="bw-management-terminal" aria-label="Terminal-only staff provisioning"><div><WorkspaceIcon name="shield" size={20} /><span>SUPER ADMIN AUTHORITY</span></div><h2>Staff provisioning</h2><p>Bootstrap is closed after the first Super Admin. Create or revoke staff permissions from the trusted terminal using your password and fresh MFA. Each change records the responsible administrator.</p><code>superadmin.js staff · authenticated terminal only</code></section>}
      <section className="bw-management-tools" aria-labelledby="management-tools-title"><div className="bw-management-section-heading"><h2 id="management-tools-title">Operational workspaces</h2><p>Reviews and approvals follow separately assigned permissions and no-self-review rules.</p></div><div className="bw-management-grid">{data.tools.map(tool => <article key={tool.key} className={tool.allowed ? "is-enabled" : ""}><span className="bw-management-tool-icon"><WorkspaceIcon name={tool.key === "organizations" ? "building" : "shield"} size={23} /></span><h3>{tool.label}</h3><p>{tool.description}</p>{tool.allowed ? <Link to={managementPath(tool.to)}>Open workspace <WorkspaceIcon name="arrow" size={15} /></Link> : <span className="bw-management-restricted">Separate permission required</span>}</article>)}</div></section>
      <section className="bw-management-future" aria-labelledby="management-future-title"><h2 id="management-future-title">Next management areas</h2><p>These browser tools are planned. Staff permissions are managed through the authenticated terminal.</p><ul>{["Team access management", "Support", "Billing", "Moderation"].map(label => <li key={label}><span>{label}</span><small>Coming soon</small></li>)}</ul></section>
      <section className="bw-management-audit" aria-labelledby="management-audit-title"><h2 id="management-audit-title">Your management access history</h2><p>The latest ten grant/revocation records for your account. Staff changes require an authenticated Super Admin in the trusted terminal.</p>{data.audits?.length ? <ol>{data.audits.map(event => <li key={event.id}><span className={(event.capabilityEnabled ?? event.toEnabled) ? "access-enabled" : "access-disabled"}>{(event.capabilityEnabled ?? event.toEnabled) ? "Permission granted" : "Permission revoked"}</span><div><p>{event.reason}</p><small>{event.capability && <>{event.capability} · </>}{date(event.createdAt)} UTC · Access version {event.version}</small></div></li>)}</ol> : <p>No access history was returned.</p>}</section>
    </>}
  </section>;
}
