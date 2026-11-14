import { useState } from "react";
import { Link } from "react-router-dom";
import { opportunitiesApi } from "../../api/opportunities";
import OrganizationAvatar from "../profile/OrganizationAvatar";
import VerificationBadge from "../VerificationBadge";
import NavigationIcon from "../layout/NavigationIcon";
import ChallengeParticipantFacepile from "./ChallengeParticipantFacepile";
import "./challenge-card.css";

export default function ChallengeCard({ opportunity, onSavedChange }) {
  const { organization } = opportunity;
  const profile = "/organizations/" + encodeURIComponent(organization.id);
  const detail = "/opportunities/" + encodeURIComponent(opportunity.id);
  const photoUrl = organization.profilePhotoId ? `/api/v1/organizations/${encodeURIComponent(organization.id)}/photo/${encodeURIComponent(organization.profilePhotoId)}` : null;
  const deadline = new Date(opportunity.deadline);
  const formattedDeadline = Number.isNaN(deadline.getTime()) ? "Not listed" : deadline.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const [saved, setSaved] = useState(Boolean(opportunity.saved));
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const mode = opportunity.workMode === "REMOTE" ? "Online"
    : opportunity.workMode === "HYBRID" ? "Online & offline" : "Offline";

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
      <Link className="bw-challenge-organization-avatar" to={profile} aria-label={"View " + organization.name + " profile"}>
        <OrganizationAvatar organization={{ ...organization, photoUrl }} icon="briefcase" />
      </Link>
      <div className="bw-challenge-primary">
        <h3 className="bw-challenge-title"><Link to={detail}>{opportunity.title}</Link></h3>
        <div className="bw-challenge-organization">
          <span className="bw-challenge-organization-name">
            <Link to={profile}>{organization.name}</Link>
            {Boolean(organization.verifiedAt) && <VerificationBadge kind="organization" />}
          </span>
        </div>
        <p className="bw-challenge-deadline">Deadline: {formattedDeadline}</p>
      </div>
      <div className="bw-challenge-prize" aria-label="Challenge prize and participation mode">
        <strong>{opportunity.prize?.trim() || "Not listed"}</strong>
        <span className="bw-challenge-mode">{mode}</span>
        <ChallengeParticipantFacepile summary={opportunity.participantSummary} />
      </div>
    </div>

    <div className="bw-challenge-divider" role="separator" aria-hidden="true" />
    <div className="bw-challenge-actions">
      <Link className="bw-timeline-opportunity-cta bw-challenge-participate" to={detail}>
        Participate on BrightWay
      </Link>
      <div className="bw-challenge-secondary">
        <button type="button" aria-label="Share challenge" title="Share challenge" onClick={() => void share()}>
          <NavigationIcon name="share" size={18} /><span>Share</span>
        </button>
        <button type="button" aria-label={saved ? "Unsave challenge" : "Save challenge"} title={saved ? "Unsave challenge" : "Save challenge"}
          aria-pressed={saved} disabled={saving} onClick={() => void toggleSaved()}>
          <NavigationIcon name="bookmark" size={18} active={saved} /><span>{saved ? "Saved" : "Save"}</span>
        </button>
        <Link to={detail} aria-label="View challenge" title="View challenge">
          <NavigationIcon name="expand" size={18} /><span>View</span>
        </Link>
      </div>
    </div>
    {feedback && <p className="bw-challenge-feedback" role="status">{feedback}</p>}
  </div>;
}
