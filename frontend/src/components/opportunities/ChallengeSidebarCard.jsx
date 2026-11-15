import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CHALLENGE_COVER_IMAGES, DEFAULT_CHALLENGE_COVER, challengeCardPrize } from "../../../../shared/challenges.mjs";
import { challengeDeadlineReminder } from "./challenge-deadline";
import { opportunitiesApi as api } from "../../api/opportunities";
import OrganizationAvatar from "../profile/OrganizationAvatar";
import VerificationBadge from "../VerificationBadge";
import ChallengeParticipantFacepile from "./ChallengeParticipantFacepile";
import ChallengeCoHosts from "./ChallengeCoHosts";
import "./challenge-sidebar-card.css";

// Cover images are local BrightWay photographs, not third-party image links.
// The prize and other details are real published Challenge data.
export default function ChallengeSidebarCard({ opportunity }) {
  const organization = opportunity.organization;
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);
  if (!organization) return null;
  const detail = "/opportunities/" + encodeURIComponent(opportunity.id);
  const sponsor = "/organizations/" + encodeURIComponent(organization.id);
  const cover = opportunity.coverAssetId ? api.challengeAssetUrl(opportunity.coverAssetId)
    : opportunity.titleAssetId ? api.challengeAssetUrl(opportunity.titleAssetId)
    : opportunity.backgroundAssetId ? api.challengeAssetUrl(opportunity.backgroundAssetId)
    : CHALLENGE_COVER_IMAGES[opportunity.coverImage] || CHALLENGE_COVER_IMAGES[DEFAULT_CHALLENGE_COVER];
  const photoUrl = organization.profilePhotoId
    ? `/api/v1/organizations/${encodeURIComponent(organization.id)}/photo/${encodeURIComponent(organization.profilePhotoId)}`
    : null;
  const prizeText = challengeCardPrize(opportunity);
  const deadline = new Date(opportunity.deadline);
  const formatted = Number.isNaN(deadline.getTime()) ? "Unavailable" :
    deadline.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

  const description = typeof opportunity.description === "string" ? opportunity.description.trim() : "";
  return <article className="bw-rail-challenge-card" aria-label={"Challenge: " + opportunity.title}>
    <Link className="bw-rail-challenge-cover" to={detail} aria-label={"View " + opportunity.title + " challenge details"}>
      <img className="bw-rail-challenge-photo" src={cover} alt="" loading="lazy" />
    </Link>
    <div className="bw-rail-challenge-details">
      <h3><Link to={detail}>{opportunity.title}</Link></h3>
      <div className="bw-rail-challenge-publisher">
        <Link className="bw-rail-challenge-logo" to={sponsor} aria-label={"View " + organization.name + " organization profile"}>
          <OrganizationAvatar organization={{ ...organization, photoUrl }} icon="briefcase" />
        </Link>
        <span className="bw-rail-challenge-sponsor-name">
          <Link to={sponsor}>{organization.name}</Link>
          {Boolean(organization.verifiedAt) && <VerificationBadge kind="organization" />}
        </span>
      </div>
      {description && <p className="bw-rail-challenge-description">{description}</p>}
      <ChallengeCoHosts collaborators={opportunity.collaborators} compact />
      <div className="bw-rail-challenge-meta">
        <div className="bw-rail-challenge-prize" aria-label="Challenge prize">
          <span>Prize</span>
          <strong title={prizeText}>{prizeText}</strong>
        </div>
        <time dateTime={opportunity.deadline} title={"Deadline: " + formatted}>
          {challengeDeadlineReminder(opportunity.deadline, currentTime)}
        </time>
      </div>
      <ChallengeParticipantFacepile summary={opportunity.participantSummary} />
    </div>
    <Link className="bw-rail-challenge-cta" to={detail}>Partake</Link>
  </article>;
}
