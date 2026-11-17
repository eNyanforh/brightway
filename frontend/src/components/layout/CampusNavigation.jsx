import { Link, NavLink } from "react-router-dom";
import { CAMPUS_MODULES, canAccessCampusModule } from "../grade-school/campus-modules";
import NavigationIcon from "./NavigationIcon";
import "./organization-navigation.css";
import "./mobile-navigation.css";
import "./campus-navigation.css";

export default function CampusNavigation({ campus, campusId, id, mobile = false, open = false, onNavigate }) {
  const base = `/campus/${campusId}`;
  const permissions = campus?.permissions || [];
  const admin = campus?.role === "PRIMARY_ADMIN";
  const has = permission => admin || permissions.includes(permission);
  const active = campus?.status === "ACTIVE";
  const setup = has("organization.campus.manage");
  const modules = active ? (CAMPUS_MODULES[campus?.engine] || []).filter(
    module => canAccessCampusModule(module, permissions, admin)
  ) : [];
  const items = [
    { to: base, label: "Overview", icon: "explore", end: true },
    ...(setup ? [{ to: base + "/setup", label: "Campus setup", icon: "work" }] : []),
    ...modules.map(module => ({ ...module, to: base + "/" + module.section })),
    ...(active && (permissions.some(p => p.startsWith("organization.campus.announcements.")) || admin)
      ? [{ to: base + "/announcements", label: "Announcements", icon: "notifications" }] : []),
    ...(active && has("organization.campus.billing.manage")
      ? [{ to: base + "/billing", label: "Platform billing", icon: "analytics" }] : []),
  ];

  if (mobile) return <nav className="bw-mobile-navigation bw-campus-mobile-navigation" aria-label="Mobile Campus navigation">
    {items.map(item => <NavLink key={item.to} to={item.to} end={item.end} onClick={onNavigate}>
      {({ isActive }) => <><span className="bw-mobile-navigation-icon"><NavigationIcon name={item.icon} active={isActive} /></span><span className="bw-mobile-navigation-label">{item.label}</span></>}
    </NavLink>)}
  </nav>;

  return <aside id={id} className={`bw-design-sidebar bw-campus-sidebar${open ? " bw-design-sidebar-open" : ""}`} aria-label="Virtual Campus navigation">
    <div className="bw-campus-sidebar-heading"><span>BRIGHTWAY CAMPUS</span><h2>{campus?.organization?.name || "Virtual Campus"}</h2><p>Independent workspace</p></div>
    <nav className="bw-design-sidebar-nav" aria-label="Campus tools">
      {items.map((item, index) => <div className="bw-campus-nav-entry" key={item.to}>
        {index === (setup ? 2 : 1) && modules.length > 0 && <p className="bw-campus-nav-group">{campus.engine === "GRADE_SCHOOL" ? "Grade School" : "TVET"}</p>}
        <NavLink to={item.to} end={item.end} onClick={onNavigate} className={({ isActive }) => isActive ? "bw-design-sidebar-active" : ""}>
          {({ isActive }) => <><NavigationIcon name={item.icon} active={isActive} /><span>{item.label}</span></>}
        </NavLink>
      </div>)}
    </nav>
    <div className="bw-design-sidebar-divider" />
    <nav className="bw-design-sidebar-nav" aria-label="Other workspaces">
      <Link to={`/organization-workspace/${campusId}`} onClick={onNavigate}><NavigationIcon name="work" /><span>Organization workspace</span></Link>
      <Link to="/work" onClick={onNavigate}><NavigationIcon name="network" /><span>Switch workspace</span></Link>
      <Link to="/explore" onClick={onNavigate}><NavigationIcon name="explore" /><span>Personal account</span></Link>
    </nav>
  </aside>;
}
