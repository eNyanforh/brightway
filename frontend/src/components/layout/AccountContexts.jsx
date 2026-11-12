import { useLocation } from "react-router-dom";
import { organizationPictureUrl } from "../../api/organization-profile";
import "./account-contexts.css";

function ContextAvatar({ context, className = "" }) {
  const initials = context.name.trim().split(/\s+/u).slice(0, 2)
    .map(part => part[0]).join("").toUpperCase();
  return <span className={`bw-context-avatar ${className}`} aria-hidden="true">
    <span>{initials || (context.type === "school" ? "S" : "O")}</span>
    {context.photoId && <img src={organizationPictureUrl(context.id, context.photoId)} alt=""
      loading="lazy" onError={event => { event.currentTarget.hidden = true; }} />}
  </span>;
}

export function AccountContextFacepile({ contexts }) {
  if (!contexts.length) return null;
  return <span className="bw-context-facepile-wrap" aria-hidden="true">
    <span className="bw-context-facepile">
      {contexts.slice(0, 3).map(context => <ContextAvatar key={context.key} context={context} />)}
    </span>
  </span>;
}

export function AccountContextChoices({ contexts, loading, error, onSelect }) {
  const location = useLocation();
  const currentCampus = new URLSearchParams(location.search).get("campus");
  const selectedOrganization = contexts.find(item => item.type === "organization" &&
    (location.pathname === `/organization-workspace/${item.id}` ||
      location.pathname.startsWith(`/organization-workspace/${item.id}/`)));
  const selectedSchool = contexts.find(item => item.type === "school" &&
    location.pathname === "/learning" && currentCampus === item.id);
  return <nav className="bw-context-chooser" aria-label="Switch account">
    <h3>Switch account</h3>
    <button type="button" className="bw-context-choice" onClick={() => onSelect("/explore")}
      aria-current={!selectedOrganization && !selectedSchool ? "page" : undefined}>
      <span className="bw-context-personal-icon" aria-hidden="true">P</span>
      <span className="bw-context-choice-label"><strong>Personal account</strong><small>Your BrightWay experience</small></span>
      {!selectedOrganization && !selectedSchool && <span className="bw-context-current">Current</span>}
    </button>
    {contexts.map(context => {
      const active = selectedOrganization?.key === context.key || selectedSchool?.key === context.key;
      return <button key={context.key} type="button" className="bw-context-choice"
        onClick={() => onSelect(context.to)} aria-current={active ? "page" : undefined}>
        <ContextAvatar context={context} />
        <span className="bw-context-choice-label"><strong>{context.name}</strong>
          <small>{context.type === "school" ? "Student campus" : "Organization workspace"}</small></span>
        {active && <span className="bw-context-current">Current</span>}
      </button>;
    })}
    {loading && <p className="bw-context-feedback" role="status">Checking your active memberships…</p>}
    {!loading && !contexts.length && <p className="bw-context-feedback">No active organization memberships or school enrollments.</p>}
    {error && <p className="bw-context-feedback" role="status">Some contexts could not be checked. Reopen the menu to retry.</p>}
  </nav>;
}
