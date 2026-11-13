import { Link } from "react-router-dom";
import ProfilePicture from "../profile/ProfilePicture";
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

/**
 * Each avatar is a real navigation link. The current identity is first (left),
 * and alternatives overlap towards the right. Nothing here grants access:
 * organization and campus links originate from the signed-in user's
 * approved membership/enrollment directory.
 */
export function AccountContextFacepile({ contexts, activeContext, personalPhotoId, personalName, onNavigate }) {
  const personal = { key: "personal", type: "personal", name: personalName || "Personal account", to: "/explore" };
  const available = [personal, ...contexts];
  // Organization workspace bootstrap can resolve before the membership list.
  // Keep that already-authorized identity visible while the list is loading.
  if (activeContext && !available.some(context => context.key === activeContext.key)) {
    available.push(activeContext);
  }
  const activeKey = activeContext?.key || personal.key;
  const ordered = [
    ...available.filter(context => context.key === activeKey),
    ...available.filter(context => context.key !== activeKey),
  ];
  return <nav className="bw-context-facepile-wrap" aria-label="Account shortcuts">
    <span className="bw-context-facepile">
      {ordered.map((context, index) => {
        const active = context.key === activeKey;
        const to = context.to || `/organization-workspace/${encodeURIComponent(context.id)}`;
        const label = context.type === "personal" ? "personal account" :
          context.type === "school" ? `${context.name} school campus` : `${context.name} organization workspace`;
        return <Link key={context.key} to={to}
          className="bw-context-facepile-link"
          style={{ zIndex: ordered.length - index }}
          aria-label={`Open ${label}`}
          aria-current={active ? "true" : undefined}
          title={active ? `Current: ${label}` : `Open ${label}`}
          onClick={event => { if (onNavigate?.(context) === false) event.preventDefault(); }}>
          {context.type === "personal"
            ? <ProfilePicture id={personalPhotoId} name={personalName} decorative
                className="bw-context-avatar bw-context-personal-alternative" />
            : <ContextAvatar context={context} />}
        </Link>;
      })}
    </span>
  </nav>;
}

export function AccountContextChoices({ contexts, activeContext, loading, error, onSelect }) {
  const activeKey = activeContext?.key;
  return <nav className="bw-context-chooser" aria-label="Switch account">
    <h3>Switch account</h3>
    <button type="button" className="bw-context-choice" onClick={() => onSelect("/explore")}
      aria-current={!activeKey ? "page" : undefined}>
      <span className="bw-context-personal-icon" aria-hidden="true">P</span>
      <span className="bw-context-choice-label"><strong>Personal account</strong><small>Your BrightWay experience</small></span>
      {!activeKey && <span className="bw-context-current">Current</span>}
    </button>
    {contexts.map(context => {
      const active = activeKey === context.key;
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
