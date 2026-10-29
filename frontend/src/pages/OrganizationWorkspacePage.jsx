import { organizationWorkspace } from "../../../shared/organization-workspace.mjs";
import CampusSetupOverview from "../components/organizations/CampusSetupOverview";
import OrganizationProfile from "../components/organizations/OrganizationProfile";
import OrganizationOverview from "../components/organizations/OrganizationOverview";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useOutletContext, useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { staffApi as api } from "../api/organization-staff";
import "./organizations.css";
const MANAGE = "organization.members.manage";
function PermissionChoices({ catalog, value, onChange, disabled }) {
  return <fieldset disabled={disabled}><legend>Permissions</legend>{catalog.map(p => <label key={p.key} className="bw-org-check"><input type="checkbox" checked={value.includes(p.key)} onChange={e => onChange(e.target.checked ? [...value, p.key].sort() : value.filter(k => k !== p.key))} />{p.label}</label>)}</fieldset>;
}
function Member({ member, catalog, disabled, save }) {
  const [permissions, setPermissions] = useState(member.permissions), [enabled, setEnabled] = useState(member.enabled);
  return <li><h3>@{member.username}</h3><p>{member.role === "PRIMARY_ADMIN" ? "Primary administrator" : enabled ? "Active staff" : "Access revoked"}</p>{member.role !== "PRIMARY_ADMIN" && <form onSubmit={e => { e.preventDefault(); void save({ expectedVersion: member.version, permissions, enabled }); }}>
    <PermissionChoices catalog={catalog} value={permissions} onChange={setPermissions} disabled={disabled} /><label className="bw-org-check"><input type="checkbox" disabled={disabled} checked={enabled} onChange={e => setEnabled(e.target.checked)} />Membership enabled</label><button disabled={disabled}>Save permissions for @{member.username}</button></form>}</li>;
}
export default function OrganizationWorkspacePage({ section = "overview" }) {
  const { account } = useAuth(), { id } = useParams();
  if (!id) return <Navigate to="/work" replace />;
  return <Workspace key={`${account?.id}:${id || "personal"}:${section}`} actor={account?.id} usernameLabel={account?.username} id={id} section={section} />;
}
function Workspace({ actor, usernameLabel, id, section }) {
  const outlet = useOutletContext(), setActing = outlet?.setActingOrganization;
  const [view, setView] = useState(null), [staff, setStaff] = useState(null), [error, setError] = useState(null), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [stale, setStale] = useState(false), [generation, setGeneration] = useState(0);
  const [username, setUsername] = useState(""), [permissions, setPermissions] = useState([]), [retrying, setRetrying] = useState(false);
  const life = useRef(null), lock = useRef(false), inviteRetry = useRef(null), currentView = useRef(null);
  const load = useCallback(async (current, preserve = false) => {
    current.controller?.abort(); current.controller = new AbortController(); const signal = current.controller.signal;
    try {
      const next = await api.context(id, signal);
      if (life.current !== current || signal.aborted) return;
      if (id) setActing?.({ accountId: actor, organization: next.organization, workspace: next.workspace || organizationWorkspace(next.organization, next.permissions, next.membership?.role) });
      if (preserve && id && currentView.current && (next.staffVersion !== currentView.current.staffVersion || JSON.stringify(next.permissions) !== JSON.stringify(currentView.current.permissions))) {
        if (!next.permissions.includes(MANAGE)) setStaff(null);
        currentView.current = next; setView(next); setStale(true); setError(new Error("Organization permissions or staff changed. Reload before continuing.")); return;
      }
      currentView.current = next; setView(next); setError(null);
      if (id && section === "staff" && next.permissions.includes(MANAGE)) {
        try { const people = await api.staff(id, signal); if (life.current === current && !signal.aborted && !preserve) setStaff(people); }
        catch (e) { if (life.current === current && !signal.aborted) { setStaff(null); setError(e); } }
      } else if (id) setStaff(null);
      if (!preserve) { setStale(false); setGeneration(g => g + 1); }
    } catch (e) { if (life.current !== current || signal.aborted || e.name === "AbortError") return; setError(e); if ([401, 403, 404].includes(e.status)) { currentView.current = null; setView(null); setStaff(null); setActing?.(null); setUsername(""); setPermissions([]); inviteRetry.current = null; setRetrying(false); } }
  }, [actor, id, section, setActing]);
  useEffect(() => {
    const current = { actor, id, controller: null }; life.current = current;
    if (actor) void Promise.resolve().then(() => { if (life.current === current) return load(current); });
    const focus = () => { if (!lock.current) void load(current, true); }; window.addEventListener("focus", focus);
    return () => { current.controller?.abort(); if (life.current === current) life.current = null; setActing?.(null); window.removeEventListener("focus", focus); };
  }, [actor, id, load, setActing]);
  useEffect(() => {
    if (!username && !permissions.length && !busy) return;
    const guard = event => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", guard); return () => window.removeEventListener("beforeunload", guard);
  }, [username, permissions, busy]);
  async function action(work, invitation = false, message = "Saved. Organization access is checked again on every request.") {
    if (lock.current) return; lock.current = true; const current = life.current; current?.controller?.abort(); setBusy(true); setError(null); setNotice("");
    try {
      await work(); if (life.current !== current) return;
      if (invitation) { inviteRetry.current = null; setRetrying(false); setUsername(""); setPermissions([]); }
      setNotice(message); await load(current);
    } catch (e) {
      if (life.current !== current) return; setError(e);
      if (invitation && (!e.status || e.status >= 500)) setRetrying(true); else { inviteRetry.current = null; setRetrying(false); setStale(true); }
      if ([401, 403, 404].includes(e.status)) { currentView.current = null; setView(null); setStaff(null); setActing?.(null); setUsername(""); setPermissions([]); }
    } finally { if (life.current === current) { lock.current = false; setBusy(false); } }
  }
  function reload() { if (lock.current) return; inviteRetry.current = null; setRetrying(false); setUsername(""); setPermissions([]); void action(async () => {}, false, ""); }
  async function more(kind) {
    if (lock.current) return; lock.current = true; setBusy(true); const current = life.current, source = staff;
    try {
      const paging = kind === "member" ? { memberCursor: source.nextMemberCursor } : { inviteCursor: source.nextInviteCursor };
      const next = await api.staff(id, undefined, paging);
      if (life.current !== current) return;
      if (id && next.staffVersion !== source.staffVersion) { setStale(true); throw new Error("Organization staffing changed. Reload before continuing."); }
      const key = kind === "member" ? "members" : "invitations", cursor = kind === "member" ? "nextMemberCursor" : "nextInviteCursor";
      const merge = old => ({ ...old, [key]: [...new Map([...old[key], ...next[key]].map(row => [row.id, row])).values()], [cursor]: next[cursor] });
      setStaff(merge);
    } catch (e) { if (life.current === current) { setError(e); if ([401, 403, 404].includes(e.status)) { setStaff(null); currentView.current = null; setView(null); setActing?.(null); } } }
    finally { if (life.current === current) { lock.current = false; setBusy(false); } }
  }
  const disabled = busy || stale || retrying;
  const campusAllowed = view?.membership?.role === "PRIMARY_ADMIN" && (view.organization.type === "SCHOOL" || view.organization.offersTraining);
  const sectionAllowed = !id || !view || section === "overview" || section === "profile" || (section === "staff" && view.permissions.includes(MANAGE)) || (section === "campus" && campusAllowed);
  return <section className={`bw-org-page${section === "profile" ? " bw-org-profile-page" : ""}`} aria-label={section === "profile" ? "Organization profile" : undefined}>{section !== "profile" && <><h1>{id && view ? view.organization.name : "Organization workspace"}</h1><p><Link to="/explore">Personal account</Link>{id && <> · <Link to="/work">Back to My Workspace</Link></>} · <Link to="/security">Account security</Link></p></>}
    {error && <p role="alert">{error.message}</p>}{notice && <p role="status">{notice}</p>}{stale && <p>Changes have been kept. Reload to discard unsaved staffing changes and get current access.</p>}
    {section !== "profile" && <button type="button" disabled={busy} onClick={reload}>Reload account workspace</button>}
    {!view && !error && <p role="status">Checking account access…</p>}

    {id && view && !sectionAllowed && <section className="bw-org-access-denied" aria-labelledby="workspace-access-title"><h2 id="workspace-access-title">This tool is not available to your role</h2><p>Your organization membership is active, but it does not include access to this organization tool.</p><Link className="bw-org-workspace-entry" to={`/organization-workspace/${id}`}>Return to your workspace</Link></section>}
    {id && view && sectionAllowed && section === "profile" && <OrganizationProfile key={`${id}:${generation}`} organization={view.organization} role={view.membership?.role} canEdit={view.membership?.role === "PRIMARY_ADMIN" || view.permissions.includes("organization.profile.manage")} />}
    {id && view && sectionAllowed && section === "overview" && <OrganizationOverview organization={view.organization} role={view.membership?.role} workspace={view.workspace || organizationWorkspace(view.organization, view.permissions, view.membership?.role)} />}
    {id && view && sectionAllowed && section === "campus" && <CampusSetupOverview organization={view.organization} />}
    {id && view && sectionAllowed && section === "staff" && <><p>Acting for <strong>{view.organization.name}</strong> as @{usernameLabel}. <Link to={`/organizations/${id}`} target="_blank" rel="noopener noreferrer">View public organization</Link></p>{view.permissions.some(p => p.startsWith("organization.credentials.")) && <p><Link to={`/organization-workspace/${id}/credentials`}>Credential Review</Link></p>}<h2>Your permissions</h2><ul>{view.permissionCatalog.filter(p => view.permissions.includes(p.key)).map(p => <li key={p.key}>{p.label}</li>)}</ul>
      {!staff && <p>Staff management requires verified email, two-factor authentication and current permission. Enable MFA in Account security, then sign in again and reload.</p>}
      {staff && <><h2>Invite staff</h2><form onSubmit={e => { e.preventDefault(); const body = inviteRetry.current || { username, permissions, expectedStaffVersion: staff.staffVersion, idempotencyKey: crypto.randomUUID() }; inviteRetry.current = body; void action(() => api.invite(id, body), true); }}><fieldset disabled={disabled}><legend>Invite an existing BrightWay account</legend><label>BrightWay username<input required pattern="[a-zA-Z0-9_]{3,30}" value={username} onChange={e => setUsername(e.target.value)} /></label><PermissionChoices catalog={view.permissionCatalog.filter(p => view.permissions.includes(p.key))} value={permissions} onChange={setPermissions} disabled={disabled} /></fieldset><button disabled={busy || stale}>{retrying ? "Retry same invitation" : "Send invitation"}</button></form>
        <h2>Staff</h2><ul className="bw-org-list">{staff.members.map(m => <Member key={`${generation}:${m.id}`} member={m} catalog={view.permissionCatalog.filter(p => view.permissions.includes(p.key))} disabled={disabled} save={body => action(() => api.change(id, m.id, { ...body, expectedStaffVersion: staff.staffVersion }))} />)}</ul>
        <h2>Pending invitations</h2><ul className="bw-org-list">{staff.invitations.map(r => <li key={r.id}><p>@{r.username} · {r.state}</p>{r.state === "PENDING" && <button disabled={disabled} onClick={() => void action(() => api.cancel(id, r.id, { expectedVersion: r.version, expectedStaffVersion: staff.staffVersion }))}>Cancel invitation for @{r.username}</button>}</li>)}</ul>{staff.nextMemberCursor && <button disabled={disabled} onClick={() => void more("member")}>More staff</button>}{staff.nextInviteCursor && <button disabled={disabled} onClick={() => void more("invite")}>More pending invitations</button>}</>}
    </>}
    {section === "profile" && <div className="bw-organization-profile-refresh"><button type="button" disabled={busy} onClick={reload}>Reload organization profile</button></div>}
  </section>;
}
