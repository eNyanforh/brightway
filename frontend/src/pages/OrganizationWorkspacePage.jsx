import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
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
export default function OrganizationWorkspacePage() {
  const { account } = useAuth(), { id } = useParams();
  return <Workspace key={`${account?.id}:${id || "personal"}`} actor={account?.id} usernameLabel={account?.username} id={id} />;
}
function Workspace({ actor, usernameLabel, id }) {
  const outlet = useOutletContext(), setActing = outlet?.setActingOrganization;
  const [view, setView] = useState(null), [staff, setStaff] = useState(null), [error, setError] = useState(null), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [stale, setStale] = useState(false), [generation, setGeneration] = useState(0);
  const [username, setUsername] = useState(""), [permissions, setPermissions] = useState([]), [retrying, setRetrying] = useState(false);
  const life = useRef(null), lock = useRef(false), inviteRetry = useRef(null), currentView = useRef(null);
  useEffect(() => { currentView.current = view; }, [view]);
  const load = useCallback(async (current, preserve = false) => {
    current.controller?.abort(); current.controller = new AbortController(); const signal = current.controller.signal;
    try {
      const next = id ? await api.context(id, signal) : await api.home(signal);
      if (life.current !== current || signal.aborted) return;
      if (preserve && id && currentView.current && (next.staffVersion !== currentView.current.staffVersion || JSON.stringify(next.permissions) !== JSON.stringify(currentView.current.permissions))) {
        if (!next.permissions.includes(MANAGE)) setStaff(null);
        setView(next); setStale(true); setError(new Error("Organization permissions or staff changed. Reload before continuing.")); return;
      }
      setView(next); setError(null);
      if (id) setActing?.({ accountId: actor, organization: next.organization });
      if (id && next.permissions.includes(MANAGE)) {
        try { const people = await api.staff(id, signal); if (life.current === current && !signal.aborted && !preserve) setStaff(people); }
        catch (e) { if (life.current === current && !signal.aborted) { setStaff(null); setError(e); } }
      } else if (id) setStaff(null);
      if (!preserve) { setStale(false); setGeneration(g => g + 1); }
    } catch (e) { if (life.current !== current || signal.aborted || e.name === "AbortError") return; setError(e); if ([401, 403, 404].includes(e.status)) { setView(null); setStaff(null); setActing?.(null); setUsername(""); setPermissions([]); inviteRetry.current = null; setRetrying(false); } }
  }, [actor, id, setActing]);
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
      if ([401, 403, 404].includes(e.status)) { setView(null); setStaff(null); setActing?.(null); setUsername(""); setPermissions([]); }
    } finally { if (life.current === current) { lock.current = false; setBusy(false); } }
  }
  function reload() { if (lock.current) return; inviteRetry.current = null; setRetrying(false); setUsername(""); setPermissions([]); void action(async () => {}, false, ""); }
  async function more(kind) {
    if (lock.current) return; lock.current = true; setBusy(true); const current = life.current, source = id ? staff : view;
    try {
      const paging = kind === "member" ? { memberCursor: source.nextMemberCursor } : { inviteCursor: source.nextInviteCursor };
      const next = id ? await api.staff(id, undefined, paging) : await api.home(undefined, paging);
      if (life.current !== current) return;
      if (id && next.staffVersion !== source.staffVersion) { setStale(true); throw new Error("Organization staffing changed. Reload before continuing."); }
      const key = kind === "member" ? id ? "members" : "organizations" : "invitations", cursor = kind === "member" ? "nextMemberCursor" : "nextInviteCursor";
      const merge = old => ({ ...old, [key]: [...new Map([...old[key], ...next[key]].map(row => [row.id, row])).values()], [cursor]: next[cursor] });
      if (id) setStaff(merge); else setView(merge);
    } catch (e) { if (life.current === current) { setError(e); if ([401, 403, 404].includes(e.status)) { setStaff(null); setView(null); setActing?.(null); } } }
    finally { if (life.current === current) { lock.current = false; setBusy(false); } }
  }
  const disabled = busy || stale || retrying;
  return <section className="bw-org-page"><h1>{id && view ? view.organization.name : "Switch account"}</h1><p><Link to="/explore">Personal account</Link>{id && <> · <Link to="/organization-workspace">Switch organization</Link></>} · <Link to="/security">Account security</Link></p>
    {error && <p role="alert">{error.message}</p>}{notice && <p role="status">{notice}</p>}{stale && <p>Changes have been kept. Reload to discard unsaved staffing changes and get current access.</p>}
    <button type="button" disabled={busy} onClick={reload}>Reload account workspace</button>
    {!view && !error && <p role="status">Checking account access…</p>}
    {!id && view && <><h2>Your organizations</h2>{!view.organizations.length && <p>You have no active organization memberships.</p>}<ul className="bw-org-list">{view.organizations.map(o => <li key={o.id}><Link to={`/organization-workspace/${o.id}`}>{o.name}</Link><p>{o.role === "PRIMARY_ADMIN" ? "Primary administrator" : "Staff"}</p></li>)}</ul><h2>Your invitations</h2>{!view.invitations.length && <p>No pending invitations.</p>}<ul className="bw-org-list">{view.invitations.map(r => <li key={r.id}><h3>{r.organization.name}</h3><p>Expires {new Date(r.expiresAt).toLocaleDateString()}</p><p>Requested permissions: {r.permissions.length ? (r.permissionLabels || r.permissions).join(", ") : "Organization workspace access"}</p><button disabled={busy || stale} onClick={() => void action(() => api.respond(r.id, { expectedVersion: r.version, decision: "ACCEPT" }))}>Accept invitation from {r.organization.name}</button>{" "}<button disabled={busy || stale} onClick={() => void action(() => api.respond(r.id, { expectedVersion: r.version, decision: "DECLINE" }))}>Decline invitation from {r.organization.name}</button></li>)}</ul>{view.nextMemberCursor && <button disabled={busy} onClick={() => void more("member")}>More organizations</button>}{view.nextInviteCursor && <button disabled={busy} onClick={() => void more("invite")}>More invitations</button>}</>}
    {id && view && <><p>Acting for <strong>{view.organization.name}</strong> as @{usernameLabel}. <Link to={`/organizations/${id}`} target="_blank" rel="noopener noreferrer">View public organization</Link></p><h2>Your permissions</h2>{!view.permissions.length && <p>Organization workspace access only.</p>}<ul>{view.permissionCatalog.filter(p => view.permissions.includes(p.key)).map(p => <li key={p.key}>{p.label}</li>)}</ul>
      {view.permissions.includes(MANAGE) && !staff && <p>Staff management requires verified email, two-factor authentication and current permission. Enable MFA in Account security, then sign in again and reload.</p>}
      {staff && <><h2>Invite staff</h2><form onSubmit={e => { e.preventDefault(); const body = inviteRetry.current || { username, permissions, expectedStaffVersion: staff.staffVersion, idempotencyKey: crypto.randomUUID() }; inviteRetry.current = body; void action(() => api.invite(id, body), true); }}><fieldset disabled={disabled}><legend>Invite an existing BrightWay account</legend><label>BrightWay username<input required pattern="[a-zA-Z0-9_]{3,30}" value={username} onChange={e => setUsername(e.target.value)} /></label><PermissionChoices catalog={view.permissionCatalog.filter(p => view.permissions.includes(p.key))} value={permissions} onChange={setPermissions} disabled={disabled} /></fieldset><button disabled={busy || stale}>{retrying ? "Retry same invitation" : "Send invitation"}</button></form>
        <h2>Staff</h2><ul className="bw-org-list">{staff.members.map(m => <Member key={`${generation}:${m.id}`} member={m} catalog={view.permissionCatalog.filter(p => view.permissions.includes(p.key))} disabled={disabled} save={body => action(() => api.change(id, m.id, { ...body, expectedStaffVersion: staff.staffVersion }))} />)}</ul>
        <h2>Pending invitations</h2><ul className="bw-org-list">{staff.invitations.map(r => <li key={r.id}><p>@{r.username} · {r.state}</p>{r.state === "PENDING" && <button disabled={disabled} onClick={() => void action(() => api.cancel(id, r.id, { expectedVersion: r.version, expectedStaffVersion: staff.staffVersion }))}>Cancel invitation for @{r.username}</button>}</li>)}</ul>{staff.nextMemberCursor && <button disabled={disabled} onClick={() => void more("member")}>More staff</button>}{staff.nextInviteCursor && <button disabled={disabled} onClick={() => void more("invite")}>More pending invitations</button>}</>}
    </>}
  </section>;
}
