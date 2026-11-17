import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { OPPORTUNITY_TYPES } from "../../../../shared/opportunities.mjs";
import { CHALLENGE_COVER_IMAGES, DEFAULT_CHALLENGE_COVER, challengeCardPrize } from "../../../../shared/challenges.mjs";
import { challengeDeadlineReminder, opportunityDaysRemaining } from "./challenge-deadline";
import { opportunitiesApi as api } from "../../api/opportunities";
import OrganizationAvatar from "../profile/OrganizationAvatar";
import NavigationIcon from "../layout/NavigationIcon";
import VerificationBadge from "../VerificationBadge";
import ChallengeParticipantFacepile from "./ChallengeParticipantFacepile";
import ChallengeCoHosts from "./ChallengeCoHosts";
import JobDetailsSummary from "./JobDetailsSummary";
import { scholarshipSummary } from "./scholarship-summary";
import "./challenge-sidebar-card.css";

// A shared presentation for all published opportunities on the right rail and catalog.
// Challenge-only information (prizes, co-hosts and participants) remains type-specific.
export default function ChallengeSidebarCard({ opportunity }) {
  const organization = opportunity.organization;
  const type = OPPORTUNITY_TYPES[opportunity.type];
  const isChallenge = opportunity.type === "CHALLENGE";
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);
  if (!organization || !type) return null;
  const detail = "/opportunities/" + encodeURIComponent(opportunity.id);
  const sponsor = "/organizations/" + encodeURIComponent(organization.id);
  const cover = opportunity.coverAssetId ? api.challengeAssetUrl(opportunity.coverAssetId)
    : isChallenge ? (opportunity.titleAssetId ? api.challengeAssetUrl(opportunity.titleAssetId)
      : opportunity.backgroundAssetId ? api.challengeAssetUrl(opportunity.backgroundAssetId)
      : CHALLENGE_COVER_IMAGES[opportunity.coverImage] || CHALLENGE_COVER_IMAGES[DEFAULT_CHALLENGE_COVER])
    : null;
  const photoUrl = organization.profilePhotoId
    ? `/api/v1/organizations/${encodeURIComponent(organization.id)}/photo/${encodeURIComponent(organization.profilePhotoId)}`
    : null;
  const prizeText = isChallenge ? challengeCardPrize(opportunity) : null;
  const deadline = new Date(opportunity.deadline);
  const formatted = Number.isNaN(deadline.getTime()) ? "Unavailable" :
    deadline.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

  const description = typeof opportunity.description === "string" ? opportunity.description.trim() : "";
  const mode = opportunity.workMode === "REMOTE" ? "Remote" : opportunity.workMode === "HYBRID" ? "Hybrid" : "In person";
  return <article className={"bw-rail-challenge-card" + (isChallenge ? "" : " bw-rail-opportunity-card bw-rail-opportunity-" + opportunity.type.toLowerCase())}
    aria-label={type.label + ": " + opportunity.title}>
    <Link className="bw-rail-challenge-cover" to={detail} aria-label={"View " + type.label.toLowerCase() + ": " + opportunity.title}>
      {cover ? <img className="bw-rail-challenge-photo" src={cover} alt="" loading="lazy" />
        : <span className="bw-rail-opportunity-cover-fallback" aria-hidden="true">
            <NavigationIcon name={type.icon} size={40} /><span>{type.plural}</span>
          </span>}
    </Link>
    <div className="bw-rail-challenge-details">
      <h3><Link to={detail}>{opportunity.title}</Link></h3>
      <div className="bw-rail-challenge-publisher">
        <Link className="bw-rail-challenge-logo" to={sponsor} aria-label={"View " + organization.name + " organization profile"}>
          <OrganizationAvatar organization={{ ...organization, photoUrl }} icon="briefcase" />
        </Link>
        <span className="bw-rail-challenge-sponsor-name">
          <Link to={sponsor} title={organization.name}>{organization.name}</Link>
          {Boolean(organization.verifiedAt) && <VerificationBadge kind="organization" />}
        </span>
      </div>
      {description && <p className="bw-rail-challenge-description">{description}</p>}
      {opportunity.type === "JOB" && <JobDetailsSummary details={opportunity.jobDetails} />}
      {opportunity.type === "SCHOLARSHIP" && <div className="bw-rail-scholarship-summary">
        {scholarshipSummary(opportunity.details) && <strong>{scholarshipSummary(opportunity.details)}</strong>}
        {Array.isArray(opportunity.details?.academicLevels) && opportunity.details.academicLevels.length > 0 &&
          <span>{opportunity.details.academicLevels.map(level => level.replaceAll("_", " ")).join(", ")}</span>}
        {Array.isArray(opportunity.details?.eligibleCountries) && opportunity.details.eligibleCountries.length > 0 &&
          <span>Eligible: {opportunity.details.eligibleCountries.join(", ")}</span>}
      </div>
      {isChallenge && <ChallengeCoHosts collaborators={opportunity.collaborators} compact />}
      <div className="bw-rail-challenge-meta">
        {isChallenge ? <div className="bw-rail-challenge-prize" aria-label="Challenge prize">
          <span>Prize</span>
          <strong title={prizeText}>{prizeText}</strong>
        </div> : <div className="bw-rail-opportunity-facts">
          {opportunity.location && <span><NavigationIcon name="pin" size={14} />{opportunity.location}</span>}
          <span><NavigationIcon name="work" size={14} />{mode}</span>
        </div>}
        <time dateTime={opportunity.deadline} title={"Deadline: " + formatted}>
          {isChallenge ? challengeDeadlineReminder(opportunity.deadline, currentTime) : opportunityDaysRemaining(opportunity.deadline, currentTime)}
        </time>
      </div>
      {isChallenge && <ChallengeParticipantFacepile summary={opportunity.participantSummary} />}
    </div>
    <Link className="bw-rail-challenge-cta" to={detail}>{isChallenge ? "Partake" : type.action}</Link>
  </article>;
}
