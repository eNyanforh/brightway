import { useState } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { useManagement } from "../auth/management-context";
import ManagementNavigation from "../components/layout/ManagementNavigation";
import "./app-shell.css";
import "../pages/superadmin.css";
export default function ManagementLayout() {
  const { staff, logout } = useManagement(), navigate = useNavigate();
  const [workspace, setWorkspace] = useState(null), [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(null);
  return <div className="bw-app-shell bw-management-shell"><header className="bw-management-independent-header"><Link to="/superadmin">BrightWay Management</Link><button aria-label="Toggle management navigation" aria-expanded={open} onClick={() => setOpen(!open)}>Menu</button><span>{staff.fullName}</span><button disabled={busy} onClick={async () => { if (busy) return; setBusy(true); try { await logout(); navigate("/superadmin/login", { replace: true }); } catch (e) { setError(e); } finally { setBusy(false); } }}>Sign out of Management</button></header>{error && <p role="alert">{error.message}</p>}<div className="bw-design-layout"><ManagementNavigation management={workspace?.staffId === staff.id ? workspace : null} open={open} onNavigate={() => setOpen(false)} /><main className="bw-app-content"><Outlet context={{ setManagementWorkspace: setWorkspace }} /></main></div><ManagementNavigation management={workspace?.staffId === staff.id ? workspace : null} mobile onNavigate={() => setOpen(false)} /></div>;
}
