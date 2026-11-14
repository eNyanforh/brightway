import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { opportunitiesApi as api } from "../../api/opportunities";
import { MAX_CHALLENGE_COLLABORATORS } from "../../../../shared/challenges.mjs";
import OrganizationAvatar from "../profile/OrganizationAvatar";
import VerificationBadge from "../VerificationBadge";

export function collaboratorPhotoUrl(organization) {
  return organization?.profilePhotoId
    ? `/api/v1/organizations/${encodeURIComponent(organization.id)}/photo/${encodeURIComponent(organization.profilePhotoId)}`
    : null;
}

export function CollaboratorIdentity({ organization }) {
  if (!organization) return null;
  return <span className="bw-collaborator-identity">
    <OrganizationAvatar organization={{ ...organization, photoUrl: collaboratorPhotoUrl(organization) }}
      icon="briefcase" />
    <span className="bw-collaborator-identity-text">
      <span className="bw-collaborator-name">{organization.name}
        {Boolean(organization.verifiedAt) && <VerificationBadge kind="organization" />}
      </span>
      <small>@{organization.username}</small>
    </span>
  </span>;
}

export default function ChallengeCollaboratorPicker({ organizationId, selected, onChange, disabled = false }) {
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState([]);
  const [status, setStatus] = useState("");
  useEffect(() => {
    const clean = q.trim();
    if (clean.replace(/^@/, "").length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setStatus("Searching…");
      void api.collaboratorSearch(organizationId, clean, controller.signal)
        .then(data => {
          if (controller.signal.aborted) return;
          setMatches(Array.isArray(data.items) ? data.items : []);
          setStatus(data.items?.length ? "" : "No matching verified organizations.");
        })
        .catch(error => { if (!controller.signal.aborted) { setMatches([]); setStatus(error.message); } });
    }, 260);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [q, organizationId]);
  const picked = new Set(selected.map(item => item.organizationId));
  function choose(organization) {
    if (picked.has(organization.id) || selected.length >= MAX_CHALLENGE_COLLABORATORS) return;
    onChange([...selected, { organizationId: organization.id, organization, state: "UNSENT" }]);
    setQ(""); setMatches([]); setStatus("");
  }
  return <section className="bw-collaborator-picker" aria-label="Challenge collaborators">
    <h4>Collaborating organizations</h4>
    <p className="bw-op-wizard-help">Find organizations already on BrightWay by name or @username. They must accept your invitation before appearing as co-hosts.</p>
    <label>Find an organization
      <input type="search" autoComplete="off" aria-label="Search organization collaborators"
        value={q} disabled={disabled || selected.length >= MAX_CHALLENGE_COLLABORATORS}
        placeholder="Organization name or @username"
        onChange={e => { setQ(e.target.value); setMatches([]); setStatus(""); }} />
    </label>
    {q.trim().replace(/^@/, "").length >= 2 && <div className="bw-collaborator-suggestions">
      {status && <p role="status">{status}</p>}
      {matches.length > 0 && <ul aria-label="Organization suggestions">
        {matches.filter(item => !picked.has(item.id)).map(org => <li key={org.id}>
          <button type="button" disabled={disabled} onClick={() => choose(org)}
            aria-label={"Invite " + org.name}>
            <CollaboratorIdentity organization={org} /><span className="bw-collaborator-add">Add</span>
          </button>
        </li>)}
      </ul>}
    </div>}
    {selected.length > 0 && <ul className="bw-collaborator-selected" aria-label="Selected collaborating organizations">
      {selected.map(item => <li key={item.organizationId}>
        <Link to={"/organizations/" + encodeURIComponent(item.organizationId)}
          aria-label={"View " + item.organization.name}><CollaboratorIdentity organization={item.organization} /></Link>
        <span className="bw-collaborator-state">{item.state === "ACCEPTED" ? "Accepted" :
          item.state === "PENDING" ? "Pending acceptance" :
          item.state === "DECLINED" ? "Declined" : "Invite on save"}</span>
        <button type="button" disabled={disabled} aria-label={"Remove " + item.organization.name}
          onClick={() => onChange(selected.filter(row => row.organizationId !== item.organizationId))}>Remove</button>
      </li>)}
    </ul>}
    <p className="bw-collaborator-limit">{selected.length} of {MAX_CHALLENGE_COLLABORATORS} collaborators</p>
  </section>;
}
