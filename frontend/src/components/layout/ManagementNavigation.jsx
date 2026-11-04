import { NavLink } from "react-router-dom";
import { managementPath } from "./management-paths";
import WorkspaceIcon from "../workspace/WorkspaceIcon";
import "./management-navigation.css";
const icons = { users:"people",directory:"building",team:"shield",support:"mail",moderation:"alert",audit:"archive",operations:"clock",organizations:"people",credentials:"archive",names:"edit" };
const active = ({ isActive }) => isActive ? "bw-design-sidebar-active" : "";
export default function ManagementNavigation({ management, mobile = false, id, open, onNavigate }) {
  const allowed = management?.allowed === true, tools = allowed ? management.tools.filter(tool => tool.allowed) : [];
  if (mobile) return <nav className="bw-mobile-navigation bw-management-mobile" aria-label="Mobile management navigation"><NavLink end to="/superadmin" onClick={onNavigate}><WorkspaceIcon name="building" /><span>Overview</span></NavLink><NavLink to="/superadmin/security" onClick={onNavigate}><WorkspaceIcon name="shield" /><span>Security</span></NavLink></nav>;
  return <aside id={id} className={`bw-design-sidebar bw-management-sidebar${open ? " bw-design-sidebar-open" : ""}`} aria-label="Management navigation">
    <div className="bw-management-nav-heading"><span>CONTROL CENTER</span><h2>Your workspace</h2><p>{allowed ? management.role?.label || "Management staff" : "Management account"}</p></div>
    <nav className="bw-design-sidebar-nav" aria-label={allowed ? "Management tools" : "Management home"}><NavLink end to="/superadmin" onClick={onNavigate} className={active}><WorkspaceIcon name="building" /><span>Overview</span></NavLink>{tools.map(tool => <NavLink end key={tool.key} to={managementPath(tool.to)} onClick={onNavigate} className={active}><WorkspaceIcon name={icons[tool.key] || "shield"} /><span>{tool.label}</span></NavLink>)}</nav>
    <div className="bw-design-sidebar-divider" /><nav className="bw-design-sidebar-nav" aria-label="Management account actions"><NavLink to="/superadmin/security" className={active} onClick={onNavigate}><WorkspaceIcon name="shield" /><span>Account security</span></NavLink></nav>
    <div className="bw-mgmt-sidebar-note"><WorkspaceIcon name="shield" size={19} /><strong>Personal accountability</strong><p>Use your own staff identity. Review decisions retain their original author.</p></div>
  </aside>;
}
