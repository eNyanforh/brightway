import { Link } from "react-router-dom";
import { OPPORTUNITY_TYPES } from "../../../../shared/opportunities.mjs";
import ChallengeCard from "./ChallengeCard";
import NavigationIcon from "../layout/NavigationIcon";
import OpportunityOrganization from "./OpportunityOrganization";
import "./opportunities.css";
export default function OpportunityCard({ opportunity: o }) {
  const type = OPPORTUNITY_TYPES[o.type];
  if (o.type === "CHALLENGE") return <article className="bw-op-card"><ChallengeCard opportunity={o} /></article>;
  return <article className={`bw-op-card bw-op-${o.type.toLowerCase()}`}>
    <div className="bw-op-card-cover"><span><NavigationIcon name={type.icon} size={22} />{type.label}</span><span className="bw-op-card-mode">{o.workMode === "REMOTE" ? "Remote" : o.workMode === "HYBRID" ? "Hybrid" : "In person"}</span></div>
    <div className="bw-op-card-body">
      <OpportunityOrganization organization={o.organization} />
      <h3><Link to={`/opportunities/${o.id}`}>{o.title}</Link></h3>
      <p className="bw-op-location"><NavigationIcon name="pin" size={15} />{o.location}</p>
      <p className="bw-op-preview">{o.description}</p>
      <div className="bw-op-card-bottom"><span>Closes {new Date(o.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span><Link to={`/opportunities/${o.id}`}>{type.action}<NavigationIcon name="chevron-right" size={14} /></Link></div>
    </div>
  </article>;
}
