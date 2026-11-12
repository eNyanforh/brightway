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

/** The active account is the full-size leading identity; its alternatives stay beside it. */
export function AccountContextPrimary({ context }) {
  return <ContextAvatar context={context} className="bw-context-main-avatar" />;
}

export function AccountContextFacepile({ contexts, activeContext, personalPhotoId, personalName }) {
  const alternatives = [
    ...(activeContext ? [{ key: "personal", type: "personal", name: personalName }] : []),
    ...contexts.filter(context => context.key !== activeContext?.key),
  ];
  if (!alternatives.length) return null;
  return <span className="bw-context-facepile-wrap" aria-hidden="true">
    <span className="bw-context-facepile">
      {alternatives.slice(0, 3).map(context => context.type === "personal"
        ? <ProfilePicture key={context.key} id={personalPhotoId}
            name={personalName} decorative className="bw-context-avatar bw-context-personal-alternative" />
        : <ContextAvatar key={context.key} context={context} />)}
    </span>
  </span>;
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
