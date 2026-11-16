import { Link, NavLink } from "react-router-dom";
import NavigationIcon from "./NavigationIcon";
import "./organization-navigation.css";
import "./mobile-navigation.css";
import "./campus-navigation.css";

export default function CampusNavigation({ campus, campusId, id, mobile = false, open = false, onNavigate }) {
  const base = `/campus/${campusId}`;
  const permissions = campus?.permissions || [];
  const admin = campus?.role === "PRIMARY_ADMIN";
  const has = permission => admin || permissions.includes(permission);
  const items = [
    { to: base, label: "Overview", icon: "explore", end: true },
    ...(admin || has("organization.campus.manage")
      ? [{ to: base + "/setup", label: "Campus setup", icon: "work" }] : []),
    ...(has("organization.campus.academics.manage") || has("organization.campus.teach")
      ? [{ to: base + "/academics", label: "Academics", icon: "learning" }] : []),
    ...(permissions.some(p => p.startsWith("organization.campus.announcements.")) || admin
      ? [{ to: base + "/announcements", label: "Announcements", icon: "notifications" }] : []),
    ...(has("organization.campus.billing.manage")
      ? [{ to: base + "/billing", label: "Billing", icon: "analytics" }] : []),
  ];

  if (mobile) return <nav className="bw-mobile-navigation bw-campus-mobile-navigation" aria-label="Mobile Campus navigation">
    {items.map(item => <NavLink key={item.to} to={item.to} end={item.end} onClick={onNavigate}>
      {({ isActive }) => <><span className="bw-mobile-navigation-icon"><NavigationIcon name={item.icon} active={isActive} /></span><span className="bw-mobile-navigation-label">{item.label}</span></>}
    </NavLink>)}
  </nav>;

  return <aside id={id} className={`bw-design-sidebar bw-campus-sidebar${open ? " bw-design-sidebar-open" : ""}`} aria-label="Virtual Campus navigation">
    <div className="bw-campus-sidebar-heading"><span>BRIGHTWAY CAMPUS</span><h2>{campus?.organization?.name || "Virtual Campus"}</h2><p>Independent workspace</p></div>
    <nav className="bw-design-sidebar-nav" aria-label="Campus tools">
      {items.map(item => <NavLink key={item.to} to={item.to} end={item.end} onClick={onNavigate} className={({ isActive }) => isActive ? "bw-design-sidebar-active" : ""}>
        {({ isActive }) => <><NavigationIcon name={item.icon} active={isActive} /><span>{item.label}</span></>}
      </NavLink>)}
    </nav>
    <div className="bw-design-sidebar-divider" />
    <nav className="bw-design-sidebar-nav" aria-label="Other workspaces">
      <Link to={`/organization-workspace/${campusId}`} onClick={onNavigate}><NavigationIcon name="work" /><span>Organization workspace</span></Link>
      <Link to="/work" onClick={onNavigate}><NavigationIcon name="network" /><span>Switch workspace</span></Link>
      <Link to="/explore" onClick={onNavigate}><NavigationIcon name="explore" /><span>Personal account</span></Link>
    </nav>
  </aside>;
}
