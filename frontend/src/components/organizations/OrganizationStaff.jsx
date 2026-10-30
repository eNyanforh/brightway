import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import WorkspaceIcon from "../workspace/WorkspaceIcon";
import "./organization-staff.css";
const liveKeys = new Set(["organization.profile.manage", "organization.members.manage", "organization.credentials.education.review", "organization.credentials.experience.review"]);
const MANAGE = "organization.members.manage";
const tabs = [["all", "All staff", "all"], ["enabled", "Enabled", "enabled"], ["revoked", "Revoked", "revoked"], ["invitations", "Invitations", "pending"]];
const joined = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";

function StaffDialog({ title, subtitle, children, busy, isBusy, onClose }) {
  const element = useRef(null), titleId = useId();
  useEffect(() => {
    const dialog = element.current, previous = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); if (previous?.isConnected) previous.focus(); else document.querySelector(".bw-staff-heading h2")?.focus(); };
  }, []);
  return <dialog ref={element} className="bw-staff-dialog" aria-labelledby={titleId} aria-describedby={`${titleId}-description`} onCancel={event => { event.preventDefault(); if (!busy && !isBusy()) onClose(); }}>
    <header className="bw-staff-dialog-heading"><span className="bw-staff-dialog-symbol"><WorkspaceIcon name="shield" size={23} /></span><div><h2 id={titleId}>{title}</h2><p id={`${titleId}-description`}>{subtitle}</p></div><button type="button" className="bw-staff-close" aria-label="Close staff dialog" disabled={busy} onClick={() => { if (!isBusy()) onClose(); }}><WorkspaceIcon name="close" size={19} /></button></header>{children}
  </dialog>;
}
function Permissions({ catalog, value, onChange, disabled }) {
  const current = catalog.filter(p => liveKeys.has(p.key)), planned = catalog.filter(p => !liveKeys.has(p.key));
  const choice = p => <label className="bw-staff-permission" key={p.key}><input type="checkbox" disabled={disabled} checked={value.includes(p.key)} onChange={event => onChange(event.target.checked ? [...value, p.key].sort() : value.filter(key => key !== p.key))} /><span>{p.label}{p.key === MANAGE && <small>Can invite people and manage permissions within their authority.</small>}</span></label>;
  return <fieldset className="bw-staff-permissions" disabled={disabled}><legend>Permissions</legend><p>Members can view the organization workspace and profile. Choose the additional access they need.</p><div>{current.map(choice)}</div>{planned.length > 0 && <details className="bw-staff-planned"><summary>Upcoming capabilities <span>{planned.length}</span></summary><p>These permissions do not activate tools that are not available yet.</p>{planned.map(choice)}</details>}</fieldset>;
}
function DraftGuard({ dirty, onDirty }) {
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  return null;
}
function DialogError({ error, stale, retrying, onReload }) {
  return <>{error && <p className="bw-staff-dialog-error" role="alert">{error.message}</p>}{retrying && <p className="bw-staff-dialog-note">Delivery is uncertain. Retry the same invitation to confirm its result; your original recipient and permissions are kept.</p>}{stale && <p className="bw-staff-dialog-note">Your changes are still here. Reload the staff list before making another change.</p>}{(stale || retrying) && <button type="button" className="bw-staff-secondary" onClick={onReload}>Reload staff list</button>}</>;
}
function InviteEditor({ organization, username, permissions, onUsername, onPermissions, catalog, busy, disabled, retrying, stale, error, isBusy, onSubmit, onClose, onDirty, onReload }) {
  const dirty = !!username.trim() || permissions.length > 0;
  function close() { if (isBusy() || retrying) return; if (!dirty || window.confirm("Discard this unsent invitation?")) onClose(); }
  return <StaffDialog title="Invite staff" subtitle={organization.name} busy={busy || retrying} isBusy={isBusy} onClose={close}>
    <DraftGuard dirty={dirty || retrying} onDirty={onDirty} /><form className="bw-staff-editor" onSubmit={event => { event.preventDefault(); if (!isBusy() && !stale) onSubmit(); }}>
      <p className="bw-staff-editor-intro">Invite an existing BrightWay account. Access begins only after they accept.</p>
      <label className="bw-staff-field">BrightWay username<span className="bw-staff-username-input"><span aria-hidden="true">@</span><input aria-label="BrightWay username" autoFocus required pattern="[a-zA-Z0-9_]{3,30}" maxLength={30} autoComplete="off" spellCheck={false} disabled={disabled} value={username} onChange={event => onUsername(event.target.value.replace(/^@/, ""))} /></span></label>
      <Permissions catalog={catalog} value={permissions} onChange={onPermissions} disabled={disabled} />
      <DialogError error={error} stale={stale} retrying={retrying} onReload={onReload} />
      <div className="bw-staff-editor-footer"><button type="button" className="bw-staff-secondary" disabled={busy || retrying} onClick={close}>Cancel</button><button type="submit" disabled={busy || stale}>{busy ? "Sending…" : retrying ? "Retry same invitation" : "Send invitation"}</button></div>
    </form>
  </StaffDialog>;
}
function MemberEditor({ member, organization, catalog, allLabels, busy, disabled, stale, error, isBusy, onSave, onClose, onDirty, onReload }) {
  const assigned = member.assignedPermissions || member.permissions;
  const [permissions, setPermissions] = useState(assigned), [enabled, setEnabled] = useState(member.enabled), [confirmed, setConfirmed] = useState(false);
  const dirty = enabled !== member.enabled || JSON.stringify([...permissions].sort()) !== JSON.stringify([...assigned].sort());
  const allowed = member.canManage ?? assigned.every(key => catalog.some(p => p.key === key));
  const selfDemotion = member.isSelf && assigned.includes(MANAGE) && (!enabled || !permissions.includes(MANAGE));
  const revoke = member.enabled && !enabled, needsConfirmation = revoke || selfDemotion;
  function close() { if (isBusy()) return; if (!dirty || window.confirm("Discard these unsaved staff changes?")) onClose(); }
  return <StaffDialog title={`${allowed ? "Manage" : "Permissions for"} @${member.username}`} subtitle={organization.name} busy={busy} isBusy={isBusy} onClose={close}>
    <DraftGuard dirty={dirty} onDirty={onDirty} /><form className="bw-staff-editor" onSubmit={event => { event.preventDefault(); if (allowed && dirty && (!needsConfirmation || confirmed) && !disabled && !isBusy()) onSave({ expectedVersion: member.version, permissions, enabled }); }}>
      {allowed ? <><p className="bw-staff-editor-intro">Changes apply to this organization. Revoking access keeps the membership and its saved permission choices.</p><Permissions catalog={catalog} value={permissions} onChange={value => { setPermissions(value); setConfirmed(false); }} disabled={disabled} /><label className="bw-staff-enabled"><span><strong>Membership enabled</strong><small>{enabled ? "This person can access the organization with the permissions above." : "This person cannot access the organization."}</small></span><input aria-label="Membership enabled" type="checkbox" disabled={disabled} checked={enabled} onChange={event => { setEnabled(event.target.checked); setConfirmed(false); }} /></label>{needsConfirmation && <label className="bw-staff-confirm"><input type="checkbox" checked={confirmed} disabled={disabled} onChange={event => setConfirmed(event.target.checked)} /><span>{selfDemotion ? "I understand this change removes my own access to Staff management." : "I understand this revokes this member’s organization access."}</span></label>}</> : <><p className="bw-staff-editor-intro">This member has permissions outside your authority. A primary administrator or an authorized manager must change their access.</p><ul className="bw-staff-readonly-permissions">{assigned.map(key => <li key={key}>{allLabels.get(key) || key}</li>)}</ul></>}
      <DialogError error={error} stale={stale} onReload={onReload} />
      <div className="bw-staff-editor-footer"><button type="button" className="bw-staff-secondary" disabled={busy} onClick={close}>{allowed ? "Cancel" : "Close"}</button>{allowed && <button type="submit" aria-label={`Save permissions for @${member.username}`} className={revoke ? "bw-staff-danger" : ""} disabled={disabled || !dirty || (needsConfirmation && !confirmed)}>{busy ? "Saving…" : revoke ? "Revoke access" : !member.enabled && enabled ? "Restore access" : "Save changes"}</button>}</div>
    </form>
  </StaffDialog>;
}
export default function OrganizationStaff({ organization, actorUsername, staff, filters, onFilter, username, permissions, onUsername, onPermissions, catalog, grantableCatalog, busy, stale, retrying, error, generation, isBusy, onInvite, onChange, onCancel, onCloseInvite, onReload, onMore, onDirty }) {
  const [tab, setTab] = useState("all"), [search, setSearch] = useState(filters.search || ""), [dialog, setDialog] = useState(null);
  const activeDialog = staff && dialog?.generation === generation ? dialog : null;
  const labels = new Map(catalog.map(p => [p.key, p.label]));
  const disabled = busy || stale || retrying, counts = staff?.counts;
  function chooseTab(next) { if (busy || activeDialog) return; setTab(next); const status = next === "invitations" ? "all" : next; if (status !== (filters.memberStatus || "all")) onFilter({ ...filters, memberStatus: status }); }
  function open(type, row) { setDialog({ type, row, generation }); }
  function close() { if (isBusy()) return; if (activeDialog?.type === "invite") onCloseInvite(); setDialog(null); }
  const total = counts ? tab === "invitations" ? counts.pending : counts[tab] : null;
  return <div className="bw-staff" aria-label="Organization staff management">
    <header className="bw-staff-heading"><div><p className="bw-staff-eyebrow">YOUR ORGANIZATION TEAM</p><h2 tabIndex={-1}>Staff</h2><p>The right people. The right access.</p></div><button type="button" className="bw-staff-invite-button" disabled={!staff || disabled} onClick={() => open("invite")}><WorkspaceIcon name="plus" size={17} />Invite staff</button></header>
    {error && !activeDialog && <p role="alert">{error.message}</p>}
    {!staff && error ? <div className="bw-staff-unavailable"><><WorkspaceIcon name="shield" size={30} /><h3>Staff list unavailable</h3><p>Managing staff requires current permission, a verified email and two-factor authentication.</p><Link to="/security">Account security</Link><button type="button" disabled={busy} onClick={onReload}>Reload staff list</button></></div> : <>
      <section className="bw-staff-directory" aria-label="Staff directory">
        <div className="bw-staff-toolbar"><div className="bw-staff-tabs" role="tablist" aria-label="Staff categories">{tabs.map(([key, label, count]) => <button key={key} type="button" id={`staff-tab-${key}`} role="tab" tabIndex={tab === key ? 0 : -1} aria-selected={tab === key} aria-controls="staff-directory-panel" disabled={busy || !!activeDialog} onClick={() => chooseTab(key)} onKeyDown={event => {
            const position = tabs.findIndex(item => item[0] === key);
            const next = event.key === "ArrowRight" ? (position + 1) % tabs.length : event.key === "ArrowLeft" ? (position + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
            if (next >= 0) { event.preventDefault(); chooseTab(tabs[next][0]); event.currentTarget.parentElement.querySelector(`#staff-tab-${tabs[next][0]}`)?.focus(); }
          }}>{label}{counts && <span>{counts[count]}</span>}</button>)}</div>
          <form className="bw-staff-search" role="search" onSubmit={event => { event.preventDefault(); if (!busy && !activeDialog) onFilter({ ...filters, search: search.trim().replace(/^@/, "").toLowerCase() }); }}><WorkspaceIcon name="search" size={17} /><input aria-label="Search staff by username" placeholder="Search username…" maxLength={100} value={search} disabled={busy || !!activeDialog} onChange={event => setSearch(event.target.value)} /><button type="submit" aria-label="Search staff" disabled={busy || !!activeDialog}>Search</button></form>
        </div>
        <div className="bw-staff-results-note"><span>{filters.search ? <>Results for <strong>@{filters.search}</strong></> : "Organization members and invitations"}</span>{filters.search && <button type="button" disabled={busy} onClick={() => { setSearch(""); onFilter({ ...filters, search: "" }); }}>Clear search</button>}<span className="bw-staff-results-total">{total === null ? staff ? "Loaded records" : "Loading…" : `${total} ${total === 1 ? "result" : "results"}`}</span></div>
        <div id="staff-directory-panel" role="tabpanel" aria-label={tabs.find(t => t[0] === tab)[1]}>
          {!staff ? <div className="bw-staff-list-loading" role="status">Loading the staff list…</div> : tab === "invitations" ? staff.invitations.length ? <ul className="bw-staff-invitation-list">{staff.invitations.map(invite => <li key={invite.id}><span className="bw-staff-avatar">{(invite.username || "?").slice(0, 2).toUpperCase()}</span><div className="bw-staff-invitation-identity"><strong>@{invite.username}</strong><span>Expires {joined(invite.expiresAt)} · UTC</span><small>{invite.permissions.length ? invite.permissions.map(key => labels.get(key) || key).join(" · ") : "Basic workspace access"}</small></div><span className="bw-staff-status bw-staff-status-pending">{invite.state === "PENDING" ? "Awaiting acceptance" : invite.state}</span>{invite.state === "PENDING" && <button type="button" className="bw-staff-row-action" aria-label={`Cancel invitation for @${invite.username}`} disabled={disabled} onClick={() => open("cancel", invite)}>Cancel invitation</button>}</li>)}</ul> : <EmptyStaff search={filters.search} invitations /> : staff.members.length ? <div className="bw-staff-table-wrap"><table className="bw-staff-table"><caption className="bw-staff-sr-only">Organization staff · {tabs.find(t => t[0] === tab)[1]}</caption><thead><tr><th scope="col">Team member</th><th scope="col">Role & access</th><th scope="col">Permissions</th><th scope="col">Joined · UTC</th><th scope="col"><span className="bw-staff-sr-only">Manage member</span></th></tr></thead><tbody>{staff.members.map(member => { const assigned = member.assignedPermissions || member.permissions; return <tr key={member.id}><td><div className="bw-staff-member-identity"><span className={`bw-staff-avatar${member.role === "PRIMARY_ADMIN" ? " bw-staff-avatar-admin" : ""}`}>{(member.username || "?").slice(0, 2).toUpperCase()}</span><div><strong>@{member.username}</strong>{(member.isSelf ?? member.username === actorUsername) && <span className="bw-staff-you">You</span>}</div></div></td><td><span className="bw-staff-role">{member.role === "PRIMARY_ADMIN" ? "Primary administrator" : "Staff member"}</span><span className={`bw-staff-status ${member.enabled ? "bw-staff-status-enabled" : "bw-staff-status-revoked"}`}>{member.enabled ? "Enabled" : "Revoked"}</span></td><td><div className="bw-staff-permission-summary">{member.role === "PRIMARY_ADMIN" ? <span>Full organization access</span> : !assigned.length ? <span>Basic workspace access</span> : <>{assigned.slice(0, 2).map(key => <span key={key}>{labels.get(key) || key}</span>)}{assigned.length > 2 && <small>+{assigned.length - 2} more</small>}</>}{!member.enabled && assigned.length > 0 && <small>Saved permissions · access is revoked</small>}</div></td><td className="bw-staff-date">{joined(member.joinedAt)}</td><td>{member.role === "PRIMARY_ADMIN" ? <span className="bw-staff-protected"><WorkspaceIcon name="shield" size={14} />Protected</span> : <button type="button" className="bw-staff-row-action" aria-label={`Manage @${member.username}`} disabled={disabled} onClick={() => open("member", member)}>Manage<WorkspaceIcon name="arrow" size={14} /></button>}</td></tr>; })}</tbody></table></div> : <EmptyStaff search={filters.search} />}
        </div>
        {staff && <footer className="bw-staff-directory-footer"><span>{tab === "invitations" ? staff.invitations.length : staff.members.length} shown{total !== null ? ` of ${total}` : " in this page"}</span>{tab !== "invitations" && staff.nextMemberCursor && <button type="button" className="bw-staff-secondary" disabled={disabled} onClick={() => onMore("member")}>More staff</button>}{tab === "invitations" && staff.nextInviteCursor && <button type="button" className="bw-staff-secondary" disabled={disabled} onClick={() => onMore("invite")}>More pending invitations</button>}</footer>}
      </section>
      <p className="bw-staff-security-note"><WorkspaceIcon name="shield" size={16} />Grant only the access each person needs. Staff changes require two-factor authentication. The primary administrator is protected.</p>
    </>}
    {activeDialog?.type === "invite" && <InviteEditor organization={organization} username={username} permissions={permissions} onUsername={onUsername} onPermissions={onPermissions} catalog={grantableCatalog} busy={busy} disabled={disabled} retrying={retrying} stale={stale} error={error} isBusy={isBusy} onSubmit={onInvite} onClose={close} onDirty={onDirty} onReload={onReload} />}
    {activeDialog?.type === "member" && <MemberEditor member={activeDialog.row} organization={organization} catalog={grantableCatalog} allLabels={labels} busy={busy} disabled={disabled} stale={stale} error={error} isBusy={isBusy} onSave={body => onChange(activeDialog.row, body)} onClose={close} onDirty={onDirty} onReload={onReload} />}
    {activeDialog?.type === "cancel" && <StaffDialog title="Cancel invitation?" subtitle={`@${activeDialog.row.username}`} busy={busy} isBusy={isBusy} onClose={close}><div className="bw-staff-editor"><p>This person will no longer be able to accept this invitation. An invitation does not grant access until accepted.</p><DialogError error={error} stale={stale} onReload={onReload} /><div className="bw-staff-editor-footer"><button type="button" className="bw-staff-secondary" disabled={busy} onClick={close}>Keep invitation</button><button type="button" className="bw-staff-danger" disabled={disabled} onClick={() => onCancel(activeDialog.row)}>{busy ? "Cancelling…" : "Cancel invitation"}</button></div></div></StaffDialog>}
  </div>;
}
function EmptyStaff({ search, invitations }) {
  return <div className="bw-staff-empty"><WorkspaceIcon name={invitations ? "mail" : "search"} size={29} /><h3>{search ? "No matching usernames" : invitations ? "No pending invitations" : "No staff in this view"}</h3><p>{search ? "Try another username or clear the search." : invitations ? "Invitations appear here until accepted, cancelled or expired." : "Choose another category to see other organization members."}</p></div>;
}
