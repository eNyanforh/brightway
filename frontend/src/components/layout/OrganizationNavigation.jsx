import { Link, NavLink } from "react-router-dom";
import NavigationIcon from "./NavigationIcon";
import "./organization-navigation.css";
import "./mobile-navigation.css";
export default function OrganizationNavigation({ acting, mobile = false, id, open, onNavigate }) {
  const ready = acting?.workspace?.available || [];
  const campusSetup = acting?.workspace?.campusSetup;
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
    {campusSetup && <><div className="bw-design-sidebar-divider" /><section className="bw-design-sidebar-organization bw-org-campus-promo" aria-labelledby="campus-promo-heading"><span className="bw-design-sidebar-eyebrow">BRING LEARNING TOGETHER</span><h3 id="campus-promo-heading">Make room for your Campus.</h3><p>A connected space for teaching, learning and school operations.</p><NavLink className="bw-design-create-org" to={campusSetup.to} onClick={onNavigate}><span className="bw-design-create-org-icon"><NavigationIcon name="plus" /></span><span>Build Campus</span></NavLink><small>Campus setup · Coming soon</small></section></>}
    <div className="bw-design-sidebar-divider" />
    <nav className="bw-design-sidebar-nav" aria-label="Account contexts"><Link to="/work" onClick={onNavigate}><NavigationIcon name="network" /><span>My Workspace</span></Link><Link to="/explore" onClick={onNavigate}><NavigationIcon name="explore" /><span>Return to Personal</span></Link></nav>
  </aside>;
}
