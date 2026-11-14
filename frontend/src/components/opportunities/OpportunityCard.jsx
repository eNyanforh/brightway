import { Link } from "react-router-dom";
import { OPPORTUNITY_TYPES } from "../../../../shared/opportunities.mjs";
import NavigationIcon from "../layout/NavigationIcon";
import OpportunityOrganization from "./OpportunityOrganization";
import ChallengeCoHosts from "./ChallengeCoHosts";
import { opportunitiesApi as api } from "../../api/opportunities";
import "./opportunities.css";
export default function OpportunityCard({ opportunity: o }) {
  const type = OPPORTUNITY_TYPES[o.type];
  const cover = o.type === "CHALLENGE" && o.coverAssetId
    ? api.challengeAssetUrl(o.coverAssetId) : null;
  return <article className={`bw-op-card bw-op-${o.type.toLowerCase()}`}>
    <div className="bw-op-card-cover" style={cover ? {
      backgroundImage: `linear-gradient(90deg, rgba(0,0,0,.70), rgba(0,0,0,.35)), url("${cover}")`,
      backgroundSize: "cover", backgroundPosition: "center",
    } : undefined}><span><NavigationIcon name={type.icon} size={22} />{type.label}</span>{o.type !== "CHALLENGE" && <span className="bw-op-card-mode">{o.workMode === "REMOTE" ? "Remote" : o.workMode === "HYBRID" ? "Hybrid" : "In person"}</span>}</div>
    <div className="bw-op-card-body">
      <OpportunityOrganization organization={o.organization} />
      {o.type === "CHALLENGE" && <ChallengeCoHosts collaborators={o.collaborators} compact />}
      <h3><Link to={`/opportunities/${o.id}`}>{o.title}</Link></h3>
      {o.type !== "CHALLENGE" && <p className="bw-op-location"><NavigationIcon name="pin" size={15} />{o.location}</p>}
      <p className="bw-op-preview">{o.description}</p>
      <div className="bw-op-card-bottom"><span>Closes {new Date(o.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span><Link to={`/opportunities/${o.id}`}>{type.action}<NavigationIcon name="chevron-right" size={14} /></Link></div>
    </div>
  </article>;
}
