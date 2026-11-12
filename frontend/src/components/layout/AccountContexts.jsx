import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { staffApi } from "../../api/organization-staff";
import { schoolApi } from "../../api/grade-school";
import { organizationPictureUrl } from "../../api/organization-profile";
import AvatarGroup from "../posts/AvatarGroup";
import "./account-contexts.css";

function resolveContexts(directory, campus) {
  const organizations = (Array.isArray(directory?.items) ? directory.items : [])
    .filter(row => row?.id && row?.name)
    .map(row => ({ key: `org:${row.id}`, id: row.id, type: "organization",
      name: row.name, photoId: row.photoId || null, to: `/organization-workspace/${row.id}` }));
  const seen = new Set();
  const schools = (Array.isArray(campus?.items) ? campus.items : [])
    .filter(row => row?.campusId && row?.schoolName &&
      row.status === "ACTIVE" && row.studentStatus === "ACTIVE" && row.available === true)
    .filter(row => {
      if (seen.has(row.campusId)) return false;
      seen.add(row.campusId);
      return true;
    })
    .map(row => ({ key: `school:${row.campusId}`, id: row.campusId, type: "school",
      name: row.schoolName, photoId: row.photoId || null,
      to: `/learning?view=campus&campus=${encodeURIComponent(row.campusId)}` }));
  return [...organizations, ...schools];
}

/** Read only session-authorized memberships; URLs do not grant workspace access. */
export function useAccountContexts(accountId) {
  const [snapshot, setSnapshot] = useState({ accountId, items: [], loading: true, error: false });
  const [refreshVersion, setRefreshVersion] = useState(0);
  const refresh = useCallback(() => setRefreshVersion(v => v + 1), []);
  useEffect(() => {
    if (!accountId) { setSnapshot({ accountId, items: [], loading: false, error: false }); return; }
    const controller = new AbortController();
    setSnapshot({ accountId, items: [], loading: true, error: false });
    Promise.allSettled([
      staffApi.directory(controller.signal, { tab: "approved" }),
      schoolApi.myCampus(controller.signal),
    ]).then(([organizations, schools]) => {
      if (controller.signal.aborted) return;
      const failure = organizations.status === "rejected" || schools.status === "rejected";
      setSnapshot({
        accountId,
        items: resolveContexts(
          organizations.status === "fulfilled" ? organizations.value : null,
          schools.status === "fulfilled" ? schools.value : null,
        ),
        loading: false,
        error: failure,
      });
    });
    return () => controller.abort();
  }, [accountId, refreshVersion]);
  return {
    contexts: snapshot.accountId === accountId ? snapshot.items : [],
    loading: snapshot.accountId !== accountId || snapshot.loading,
    error: snapshot.accountId === accountId && snapshot.error,
    refresh,
  };
}

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
    <AvatarGroup className="bw-context-facepile" label="Available account contexts" max={3}>
      {contexts.map(context => <ContextAvatar key={context.key} context={context} />)}
    </AvatarGroup>
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
