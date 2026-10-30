import OrganizationStaff from "../components/organizations/OrganizationStaff";
import { organizationWorkspace } from "../../../shared/organization-workspace.mjs";
import CampusSetupOverview from "../components/organizations/CampusSetupOverview";
import OrganizationProfile from "../components/organizations/OrganizationProfile";
import OrganizationOverview from "../components/organizations/OrganizationOverview";
import WorkspaceIcon from "../components/workspace/WorkspaceIcon";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useOutletContext, useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { staffApi as api } from "../api/organization-staff";
import "./organizations.css";
const MANAGE = "organization.members.manage";
export default function OrganizationWorkspacePage({ section = "overview" }) {
  const { account } = useAuth(), { id } = useParams();
  if (!id) return <Navigate to="/work" replace />;
  return <Workspace key={`${account?.id}:${id || "personal"}:${section}`} actor={account?.id} usernameLabel={account?.username} id={id} section={section} />;
}
function Workspace({ actor, usernameLabel, id, section }) {
  const outlet = useOutletContext(), setActing = outlet?.setActingOrganization;
  const [view, setView] = useState(null), [staff, setStaff] = useState(null), [error, setError] = useState(null), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [stale, setStale] = useState(false), [generation, setGeneration] = useState(0);
  const [username, setUsername] = useState(""), [permissions, setPermissions] = useState([]), [retrying, setRetrying] = useState(false);
  const life = useRef(null), lock = useRef(false), inviteRetry = useRef(null), currentView = useRef(null), filtersRef = useRef({}), editorDirtyRef = useRef(false);
  const [filters, setFilters] = useState({}), [editorDirty, setEditorDirty] = useState(false);
  const changeEditorDirty = useCallback(value => { editorDirtyRef.current = value; setEditorDirty(value); }, []);
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
        try {
          const query = filtersRef.current, people = await api.staff(id, signal, query);
          if (people.organizationId !== undefined && people.organizationId !== id) throw Error("Staff data does not belong to this organization. Reload to try again.");
          if (!Array.isArray(people.members) || !Array.isArray(people.invitations)) throw Error("Staff data could not be read. Reload to try again.");
          if (life.current === current && !signal.aborted && JSON.stringify(query) === JSON.stringify(filtersRef.current)) setStaff(previous => !preserve || previous === null ? people : previous);
        }
        catch (e) { if (life.current === current && !signal.aborted) {
          if (!preserve || [401, 403, 404].includes(e.status)) setStaff(null); else setStale(true);
          if ([401, 403, 404].includes(e.status)) { setUsername(""); setPermissions([]); inviteRetry.current = null; setRetrying(false); changeEditorDirty(false); setGeneration(g => g + 1); }
          setError(e);
        } }
      } else if (id) setStaff(null);
      if (!preserve) { setStale(false); changeEditorDirty(false); setGeneration(g => g + 1); }
    } catch (e) { if (life.current !== current || signal.aborted || e.name === "AbortError") return; setError(e); if ([401, 403, 404].includes(e.status)) { currentView.current = null; setView(null); setStaff(null); setActing?.(null); setUsername(""); setPermissions([]); inviteRetry.current = null; setRetrying(false); changeEditorDirty(false); setGeneration(g => g + 1); } }
  }, [actor, id, section, setActing, changeEditorDirty]);
  useEffect(() => {
    const current = { actor, id, controller: null }; life.current = current;
    if (actor) void Promise.resolve().then(() => { if (life.current === current) return load(current); });
    const focus = () => { if (!lock.current) void load(current, true); }; window.addEventListener("focus", focus);
    return () => { current.controller?.abort(); if (life.current === current) life.current = null; setActing?.(null); window.removeEventListener("focus", focus); };
  }, [actor, id, load, setActing]);
  useEffect(() => {
    if (!username && !permissions.length && !busy && !editorDirty) return;
    const guard = event => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", guard); return () => window.removeEventListener("beforeunload", guard);
  }, [username, permissions, busy, editorDirty]);
  async function action(work, invitation = false, message = "Saved. Organization access is checked again on every request.") {
    if (lock.current) return; lock.current = true; const current = life.current; current?.controller?.abort(); setBusy(true); setError(null); setNotice("");
    try {
      await work(); if (life.current !== current) return;
      if (invitation) { inviteRetry.current = null; setRetrying(false); setUsername(""); setPermissions([]); }
      setNotice(message); await load(current);
    } catch (e) {
      if (life.current !== current) return; setError(e);
      if (invitation && (!e.status || e.status >= 500)) setRetrying(true);
      else { inviteRetry.current = null; setRetrying(false); if (e.status === 409 || !invitation) setStale(true); }
      if ([401, 403, 404].includes(e.status)) { currentView.current = null; setView(null); setStaff(null); setActing?.(null); setUsername(""); setPermissions([]); inviteRetry.current = null; setRetrying(false); changeEditorDirty(false); setGeneration(g => g + 1); }
    } finally { if (life.current === current) { lock.current = false; setBusy(false); } }
  }
  function reload() { if (lock.current) return; if ((editorDirtyRef.current || username || permissions.length) && !window.confirm("Reload the staff list and discard unsaved changes? No new invitation will be sent.")) return; inviteRetry.current = null; setRetrying(false); setUsername(""); setPermissions([]); void action(async () => {}, false, ""); }
  function filterStaff(next) {
    if (lock.current) return;
    const normalized = { ...(next.search ? { search: next.search } : {}), ...(next.memberStatus && next.memberStatus !== "all" ? { memberStatus: next.memberStatus } : {}) };
    if (JSON.stringify(normalized) === JSON.stringify(filtersRef.current)) return;
    filtersRef.current = normalized; setFilters(normalized); setStaff(null); void load(life.current);
  }
  async function more(kind) {
    if (lock.current) return; lock.current = true; setBusy(true); const current = life.current, source = staff;
    try {
      const paging = kind === "member" ? { memberCursor: source.nextMemberCursor } : { inviteCursor: source.nextInviteCursor };
      const next = await api.staff(id, undefined, { ...filtersRef.current, ...paging });
      if (life.current !== current) return;
      if (next.organizationId !== undefined && next.organizationId !== id) throw Error("Staff page does not belong to this organization. Reload before continuing.");
      if (!Array.isArray(next.members) || !Array.isArray(next.invitations)) throw Error("Staff page could not be read. Reload before continuing.");
      if (id && next.staffVersion !== source.staffVersion) { setStale(true); throw new Error("Organization staffing changed. Reload before continuing."); }
      const key = kind === "member" ? "members" : "invitations", cursor = kind === "member" ? "nextMemberCursor" : "nextInviteCursor";
      const merge = old => ({ ...old, counts: next.counts || old.counts, [key]: [...new Map([...old[key], ...next[key]].map(row => [row.id, row])).values()], [cursor]: next[cursor] });
      setStaff(merge);
    } catch (e) { if (life.current === current) { setError(e); if ([401, 403, 404].includes(e.status)) { setStaff(null); currentView.current = null; setView(null); setActing?.(null); setUsername(""); setPermissions([]); inviteRetry.current = null; setRetrying(false); changeEditorDirty(false); setGeneration(g => g + 1); } } }
    finally { if (life.current === current) { lock.current = false; setBusy(false); } }
  }
  const campusAllowed = view?.membership?.role === "PRIMARY_ADMIN" && (view.organization.type === "SCHOOL" || view.organization.offersTraining);
  const sectionAllowed = !id || !view || section === "overview" || section === "profile" || (section === "staff" && view.permissions.includes(MANAGE)) || (section === "campus" && campusAllowed);
  return <section className={`bw-org-page${section === "profile" ? " bw-org-profile-page" : section === "overview" ? " bw-org-dashboard-page" : section === "staff" ? " bw-org-staff-page" : ""}`} aria-label={section === "profile" ? "Organization profile" : undefined}>
    {(section === "overview" || section === "staff") && <header className="bw-dashboard-page-heading"><nav className="bw-dashboard-breadcrumb" aria-label="Workspace breadcrumb"><Link to="/work">My Workspace</Link><span aria-hidden="true">/</span><span>{section === "staff" ? "Staff" : "Organization workspace"}</span></nav><div className="bw-dashboard-heading-row"><div className="bw-dashboard-heading-identity"><span className="bw-dashboard-heading-icon"><WorkspaceIcon name="building" size={24} /></span><div><h1>{view?.organization.name || "Organization workspace"}</h1><p>Your organization workspace</p></div></div><div className="bw-dashboard-heading-actions"><Link className="bw-dashboard-personal-link" to="/explore">Personal account</Link><button className="bw-dashboard-refresh" type="button" disabled={busy} onClick={reload} aria-label="Reload account workspace" aria-busy={busy}><WorkspaceIcon name="refresh" size={16} /><span>{busy ? "Refreshing…" : "Refresh"}</span></button></div></div></header>}
    {section !== "profile" && section !== "overview" && section !== "staff" && <><h1>{id && view ? view.organization.name : "Organization workspace"}</h1><p><Link to="/explore">Personal account</Link>{id && <> · <Link to="/work">Back to My Workspace</Link></>} · <Link to="/security">Account security</Link></p></>}
    {error && !(section === "staff" && view && sectionAllowed) && <p role="alert">{error.message}</p>}{notice && <p role="status">{notice}</p>}{stale && <p>Changes have been kept. Reload to discard unsaved staffing changes and get current access.</p>}
    {section !== "profile" && section !== "overview" && section !== "staff" && <button type="button" disabled={busy} onClick={reload}>Reload account workspace</button>}
    {!view && !error && (section === "overview" ? <div className="bw-dashboard-loading" role="status">Checking account access…<span aria-hidden="true" /><span aria-hidden="true" /></div> : <p role="status">Checking account access…</p>)}

    {id && view && !sectionAllowed && <section className="bw-org-access-denied" aria-labelledby="workspace-access-title"><h2 id="workspace-access-title">This tool is not available to your role</h2><p>Your organization membership is active, but it does not include access to this organization tool.</p><Link className="bw-org-workspace-entry" to={`/organization-workspace/${id}`}>Return to your workspace</Link></section>}
    {id && view && sectionAllowed && section === "profile" && <OrganizationProfile key={`${id}:${generation}`} organization={view.organization} role={view.membership?.role} canEdit={view.membership?.role === "PRIMARY_ADMIN" || view.permissions.includes("organization.profile.manage")} />}
    {id && view && sectionAllowed && section === "overview" && <OrganizationOverview organization={view.organization} role={view.membership?.role} refreshVersion={`${generation}:${view.staffVersion}:${view.permissions.join(",")}`} />}
    {id && view && sectionAllowed && section === "campus" && <CampusSetupOverview organization={view.organization} />}
    {id && view && sectionAllowed && section === "staff" && <OrganizationStaff organization={view.organization} actorUsername={usernameLabel} staff={staff} filters={filters} onFilter={filterStaff}
      username={username} permissions={permissions} onUsername={setUsername} onPermissions={setPermissions} catalog={view.permissionCatalog} grantableCatalog={view.permissionCatalog.filter(p => view.permissions.includes(p.key))}
      busy={busy} stale={stale} retrying={retrying} error={error} generation={generation} isBusy={() => lock.current} onDirty={changeEditorDirty}
      onInvite={() => { const body = inviteRetry.current || { username, permissions, expectedStaffVersion: staff.staffVersion, idempotencyKey: crypto.randomUUID() }; inviteRetry.current = body; void action(() => api.invite(id, body), true); }}
      onChange={(member, body) => action(() => api.change(id, member.id, { ...body, expectedStaffVersion: staff.staffVersion }))}
      onCancel={invite => action(() => api.cancel(id, invite.id, { expectedVersion: invite.version, expectedStaffVersion: staff.staffVersion }))}
      onCloseInvite={() => { setUsername(""); setPermissions([]); }} onReload={reload} onMore={more} />}
    {section === "profile" && <div className="bw-organization-profile-refresh"><button type="button" disabled={busy} onClick={reload}>Reload organization profile</button></div>}
  </section>;
}
