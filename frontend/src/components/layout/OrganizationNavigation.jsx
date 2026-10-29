import { Link, NavLink } from "react-router-dom";
import NavigationIcon from "./NavigationIcon";
import "./organization-navigation.css";
import "./mobile-navigation.css";
export default function OrganizationNavigation({ acting, mobile = false, id, open, onNavigate }) {
  const ready = acting?.workspace?.available || [];
  const items = ready.filter(item => !item.external);
  if (mobile) return <nav className="bw-mobile-navigation bw-org-mobile-navigation" style={{ gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))` }} aria-label="Mobile organization navigation">
    {items.map(item => <NavLink key={item.key} end={item.key === "overview"} to={item.to} onClick={onNavigate}>{({ isActive }) => <><span className="bw-mobile-navigation-icon"><NavigationIcon name={item.icon} active={isActive} /></span><span className="bw-mobile-navigation-label">{item.shortLabel || item.label}</span></>}</NavLink>)}
    <Link to="/work" onClick={onNavigate}><span className="bw-mobile-navigation-icon"><NavigationIcon name="network" /></span><span className="bw-mobile-navigation-label">Workspaces</span></Link>
  </nav>;
  return <aside id={id} className={`bw-design-sidebar bw-org-sidebar${open ? " bw-design-sidebar-open" : ""}`} aria-label="Organization navigation">
    <div className="bw-org-context-heading"><span className="bw-design-sidebar-eyebrow">ORGANIZATION ACCOUNT</span><h2>{acting?.organization.name || "Organization workspace"}</h2></div>
    {!acting && <p>Organization access is checked before tools are shown.</p>}
    <nav className="bw-design-sidebar-nav" aria-label="Organization tools">
      {ready.map(item => item.external ? <a key={item.key} href={item.to} target="_blank" rel="noopener noreferrer" onClick={onNavigate}><NavigationIcon name={item.icon} /><span>{item.label}</span></a> : <NavLink key={item.key} end={item.key === "overview"} to={item.to} onClick={onNavigate} className={({ isActive }) => isActive ? "bw-design-sidebar-active" : ""}>{({ isActive }) => <><NavigationIcon name={item.icon} active={isActive} /><span>{item.label}</span></>}</NavLink>)}
    </nav>
    <div className="bw-design-sidebar-divider" />
    <nav className="bw-design-sidebar-nav" aria-label="Account contexts"><Link to="/work" onClick={onNavigate}><NavigationIcon name="network" /><span>My Workspace</span></Link><Link to="/explore" onClick={onNavigate}><NavigationIcon name="explore" /><span>Return to Personal</span></Link></nav>
  </aside>;
}
