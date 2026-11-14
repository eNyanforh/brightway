import { Link } from "react-router-dom";
import { CollaboratorIdentity } from "./ChallengeCollaboratorPicker";
import "./challenge-collaborators.css";
export default function ChallengeCoHosts({ collaborators, compact = false }) {
  const accepted = (Array.isArray(collaborators) ? collaborators : [])
    .filter(item => item.state === "ACCEPTED" && item.organization);
  if (!accepted.length) return null;
  return <div className={"bw-challenge-cohosts" + (compact ? " is-compact" : "")}
    aria-label="Challenge co-host organizations">
    <span>Co-hosted with</span>
    <ul>{accepted.map(item => <li key={item.organizationId}>
      <Link to={"/organizations/" + encodeURIComponent(item.organizationId)}
        aria-label={"View co-host " + item.organization.name}>
        <CollaboratorIdentity organization={item.organization} />
      </Link>
    </li>)}</ul>
  </div>;
}
