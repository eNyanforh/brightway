import { managementApi } from "../api/management";
import { validManagementContext } from "../components/layout/management-paths";
import { subscribeFocus } from "../auth/focus-refresh";
import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useManagement } from "../auth/management-context";
import ManagementNavigation from "../components/layout/ManagementNavigation";
import BrightWayLogo from "../components/layout/BrightWayLogo";
import WorkspaceIcon from "../components/workspace/WorkspaceIcon";
import "./app-shell.css";
import "../pages/superadmin.css";
export default function ManagementLayout() {
  const { staff, logout } = useManagement(), navigate = useNavigate();
  const { pathname } = useLocation(), menuButton = useRef(null);
  const [workspace, setWorkspace] = useState(null), [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(null);
  useEffect(() => {
    if (!open) return;
    const close = event => { if (event.key === "Escape") { setOpen(false); menuButton.current?.focus(); } };
    window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close);
  }, [open]);
  useEffect(() => {
    if (pathname !== "/superadmin/security") return;
    let disposed = false, pending = false, controller;
    async function load() {
      if (pending) return; pending = true; controller = new AbortController();
      try {
        const next = await managementApi.context(controller.signal);
        if (!disposed) { if (!validManagementContext(next,staff.id)) throw Error("Management navigation could not be verified."); setWorkspace(next); }
      } catch (failure) { if (!disposed && failure.name !== "AbortError") { if ([401,403,404].includes(failure.status)) setWorkspace(null); } }
      finally { pending = false; }
    }
    void load(); const off = subscribeFocus(load);
    return () => { disposed = true; controller?.abort(); off(); };
  },[pathname,staff.id]);
  const section = { users: "Users", directory: "Organization oversight", team: "Team access", support: "Support", reports: "Reports", "post-reviews": "Post review", audit: "Audit log", operations: "Operations", credentials: "Credential reviews", identity: "Identity reviews", photos: "Photo reviews", names: "Name corrections", organizations: "Organization reviews", security: "Account security" }[pathname.split("/")[2]] || "Overview";
  const visibleWorkspace = workspace?.staffId === staff.id ? workspace : null;
  return <div className="bw-app-shell bw-management-shell">
    <a className="bw-mgmt-skip" href="#management-content">Skip to content</a>
    <header className="bw-management-independent-header">
      <Link className="bw-mgmt-wordmark" to="/superadmin" aria-label="BrightWay Management home"><BrightWayLogo className="bw-superadmin-logo" width={38} height={38} /><span className="bw-mgmt-brand-text">BrightWay<small>MANAGEMENT</small></span></Link>
      <button ref={menuButton} className="bw-mgmt-menu-toggle" aria-label="Toggle management navigation" aria-controls="management-sidebar" aria-expanded={open} onClick={() => setOpen(!open)}><WorkspaceIcon name={open ? "close" : "menu"} size={18} /><span>Menu</span></button>
      <span className="bw-mgmt-breadcrumb">Management <span>/</span> <strong>{section}</strong></span>
      <div className="bw-mgmt-staff"><span className="bw-mgmt-staff-symbol" aria-hidden="true"><WorkspaceIcon name="shield" size={18} /></span><span>{staff.fullName || staff.username}<small>Management identity</small></span></div>
      <button className="bw-mgmt-signout" disabled={busy} onClick={async () => { if (busy) return; setBusy(true); try { await logout(); navigate("/superadmin/login", { replace: true }); } catch (e) { setError(e); } finally { setBusy(false); } }}>Sign out of Management</button>
    </header>
    {error && <p className="bw-mgmt-shell-alert" role="alert">{error.message}</p>}
    <div className="bw-design-layout"><ManagementNavigation id="management-sidebar" management={visibleWorkspace} open={open} onNavigate={() => setOpen(false)} /><main id="management-content" tabIndex={-1} className="bw-app-content"><Outlet context={{ setManagementWorkspace: setWorkspace }} /></main></div>
    <ManagementNavigation management={visibleWorkspace} mobile onNavigate={() => setOpen(false)} />
  </div>;
}
