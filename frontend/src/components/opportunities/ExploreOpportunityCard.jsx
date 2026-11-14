import ChallengeCard from "./ChallengeCard";
import { Link } from "react-router-dom";
import { OPPORTUNITY_TYPES } from "../../../../shared/opportunities.mjs";
import OrganizationAvatar from "../profile/OrganizationAvatar";
import VerificationBadge from "../VerificationBadge";
import NavigationIcon from "../layout/NavigationIcon";
import PostTimestamp from "../posts/PostTimestamp";

const EXPLORE_OPPORTUNITY_CATEGORIES = Object.freeze({
  JOB: "Jobs & Internships",
  SCHOLARSHIP: "Scholarships",
  CHALLENGE: "Challenges & Competitions",
  EVENT: "Events",
});

// Catalog content in Explore: not a social post, and never passed to PostViewer.
export default function ExploreOpportunityCard({ opportunity, onSavedChange }) {
  const organization = opportunity.organization;
  const type = OPPORTUNITY_TYPES[opportunity.type];
  const category = EXPLORE_OPPORTUNITY_CATEGORIES[opportunity.type];
  if (!organization || !type || !category) return null;

  const profile = "/organizations/" + encodeURIComponent(organization.id);
  const detail = "/opportunities/" + encodeURIComponent(opportunity.id);
  const categoryHref = "/opportunities?type=" + encodeURIComponent(opportunity.type);
  const photoUrl = organization.profilePhotoId
    ? `/api/v1/organizations/${encodeURIComponent(organization.id)}/photo/${encodeURIComponent(organization.profilePhotoId)}`
    : null;
  const deadline = new Date(opportunity.deadline);
  const formattedDeadline = Number.isNaN(deadline.getTime()) ? "Not listed" : deadline.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return <article className={"bw-timeline-post bw-timeline-opportunity bw-timeline-opportunity-" + opportunity.type.toLowerCase()}
    data-post-type="OPPORTUNITY" aria-label={type.label + " opportunity: " + opportunity.title}>
    <header className="bw-timeline-opportunity-category">
      <span><NavigationIcon name={type.icon} size={18} />{category}</span>
      <Link to={categoryHref}>See all <NavigationIcon name="chevron-right" size={16} /></Link>
    </header>
    {opportunity.type === "CHALLENGE"
      ? <ChallengeCard opportunity={opportunity} onSavedChange={onSavedChange} />
      : <div className="bw-timeline-opportunity-card">
        <Link className="bw-timeline-avatar" to={profile} aria-label={"View " + organization.name + " profile"}>
          <OrganizationAvatar organization={{ ...organization, photoUrl }} icon="briefcase" />
        </Link>
        <div className="bw-timeline-post-main">
          <header className="bw-timeline-byline">
            <span className="bw-post-publisher-name">
              <Link to={profile}>{organization.name}</Link>
              {Boolean(organization.verifiedAt) && <VerificationBadge kind="organization" />}
            </span>
            <span aria-hidden="true">·</span>
            <PostTimestamp createdAt={opportunity.publishedAt || opportunity.createdAt} />
          </header>
          <div className="bw-timeline-opportunity-body">
            <h3><Link to={detail}>{opportunity.title}</Link></h3>
            <p className="bw-timeline-opportunity-description">{opportunity.description}</p>
            <div className="bw-timeline-opportunity-meta">
              <span><NavigationIcon name="pin" size={15} />{opportunity.location}</span>
              <span><NavigationIcon name="calendar" size={15} />Closes {formattedDeadline}</span>
            </div>
            <div className="bw-timeline-opportunity-actions">
              <Link className="bw-timeline-opportunity-cta" to={detail}>{type.action} on BrightWay <NavigationIcon name="chevron-right" size={17} /></Link>
            </div>
          </div>
        </div>
      </div>}
  </article>;
}
