import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { OPPORTUNITY_TYPES } from "../../../../shared/opportunities.mjs";
import { opportunitiesApi } from "../../api/opportunities";
import OrganizationAvatar from "../profile/OrganizationAvatar";
import VerificationBadge from "../VerificationBadge";
import NavigationIcon from "../layout/NavigationIcon";
import PostTimestamp from "../posts/PostTimestamp";
import ChallengeParticipantFacepile from "./ChallengeParticipantFacepile";
import { challengeDeadlineReminder } from "./challenge-deadline";
import { CHALLENGE_COVER_IMAGES, DEFAULT_CHALLENGE_COVER, challengeCardPrize } from "../../../../shared/challenges.mjs";
import ChallengeCoHosts from "./ChallengeCoHosts";

const EXPLORE_OPPORTUNITY_CATEGORIES = Object.freeze({
  JOB: "Jobs & Internships",
  SCHOLARSHIP: "Scholarships",
  CHALLENGE: "Challenges & Competitions",
  EVENT: "Events",
});

function ChallengeCard({ opportunity, organization, profile, detail, photoUrl, formattedDeadline, onSavedChange }) {
  const [saved, setSaved] = useState(Boolean(opportunity.saved));
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);
  const prizeText = challengeCardPrize(opportunity);
  const cover = opportunity.coverAssetId ? opportunitiesApi.challengeAssetUrl(opportunity.coverAssetId)
    : opportunity.titleAssetId ? opportunitiesApi.challengeAssetUrl(opportunity.titleAssetId)
    : opportunity.backgroundAssetId ? opportunitiesApi.challengeAssetUrl(opportunity.backgroundAssetId)
    : CHALLENGE_COVER_IMAGES[opportunity.coverImage] || CHALLENGE_COVER_IMAGES[DEFAULT_CHALLENGE_COVER];

  async function toggleSaved() {
    if (saving) return;
    setSaving(true);
    setFeedback("");
    try {
      const updated = await opportunitiesApi.setSaved(opportunity.id, !saved);
      setSaved(Boolean(updated.saved));
      onSavedChange?.(opportunity.id, Boolean(updated.saved));
      setFeedback(updated.saved ? "Challenge saved to your account." : "Challenge removed from your saved items.");
    } catch (error) {
      setFeedback(error?.message || "Could not update your saved challenge. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function share() {
    const url = new URL(detail, window.location.origin).href;
    setFeedback("");
    if (navigator.share) {
      try {
        await navigator.share({ title: opportunity.title, url });
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setFeedback("Challenge link copied.");
      } else {
        setFeedback("Share this challenge link: " + url);
      }
    } catch {
      setFeedback("Share this challenge link: " + url);
    }
  }

  return <div className="bw-timeline-opportunity-card bw-challenge-card">
    <div className="bw-challenge-overview">
      <div className="bw-challenge-primary">
        <h3 className="bw-challenge-title"><Link to={detail}>{opportunity.title}</Link></h3>
        <div className="bw-challenge-organization">
          <Link className="bw-challenge-organization-avatar" to={profile} aria-label={"View " + organization.name + " profile"}>
            <OrganizationAvatar organization={{ ...organization, photoUrl }} icon="briefcase" />
          </Link>
          <span className="bw-challenge-organization-name">
            <Link to={profile}>{organization.name}</Link>
            {Boolean(organization.verifiedAt) && <VerificationBadge kind="organization" />}
          </span>
        </div>
        <ChallengeCoHosts collaborators={opportunity.collaborators} compact />
        <div className="bw-challenge-prize" aria-label="Challenge prize">
          <strong title={prizeText}>{prizeText}</strong>
        </div>
        <p className="bw-challenge-deadline"><time dateTime={opportunity.deadline}
          title={"Deadline: " + formattedDeadline}>{challengeDeadlineReminder(opportunity.deadline, currentTime)}</time></p>
        <ChallengeParticipantFacepile summary={opportunity.participantSummary} />
      </div>
      <Link className="bw-challenge-cover-link" to={detail} aria-label={"Open " + opportunity.title}>
        <img className="bw-challenge-cover-photo" src={cover} alt="" loading="lazy" />
      </Link>
    </div>

    <div className="bw-challenge-divider" role="separator" aria-hidden="true" />
    <div className="bw-challenge-actions">
      <Link className="bw-timeline-opportunity-cta bw-challenge-participate" to={detail}>
        Take Part
      </Link>
      <div className="bw-challenge-secondary">
        <button type="button" aria-label="Share challenge" title="Share challenge" onClick={() => void share()}>
          <NavigationIcon name="share" size={18} /><span>Share</span>
        </button>
        <button type="button" aria-label={saved ? "Unsave challenge" : "Save challenge"} title={saved ? "Unsave challenge" : "Save challenge"}
          aria-pressed={saved} disabled={saving} onClick={() => void toggleSaved()}>
          <NavigationIcon name="bookmark" size={18} active={saved} /><span>{saved ? "Saved" : "Save"}</span>
        </button>
      </div>
    </div>
    {feedback && <p className="bw-challenge-feedback" role="status">{feedback}</p>}
  </div>;
}

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
      ? <ChallengeCard opportunity={opportunity} organization={organization} profile={profile} detail={detail}
          photoUrl={photoUrl} formattedDeadline={formattedDeadline} onSavedChange={onSavedChange} />
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
