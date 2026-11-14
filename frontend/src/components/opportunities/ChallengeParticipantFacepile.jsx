import { useState } from "react";
import { Link } from "react-router-dom";
import { memberPhotoUrl } from "../../api/organization-posts";
import AvatarGroup from "../posts/AvatarGroup";

function ParticipantAvatar({ member }) {
  const photo = member.verified === true && member.photoId
    ? memberPhotoUrl(member.username, member.photoId) : null;
  const [failed, setFailed] = useState(false);
  return <Link className="bw-challenge-participant-avatar"
    to={"/" + encodeURIComponent(member.username)}
    title={member.name} aria-label={member.name + " participating in challenge"}>
    {photo && !failed
      ? <img src={photo} alt="" loading="lazy" onError={() => setFailed(true)} />
      : <svg viewBox="0 0 24 24" width="15" height="15" fill="none"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="8" r="3.5" />
          <path d="M4.7 20c.35-4.3 3-6.4 7.3-6.4s6.95 2.1 7.3 6.4" />
        </svg>}
  </Link>;
}

// Only display participants whose submitted Challenge application carries
// separate public-visibility consent. Never infer participation from saves.
export default function ChallengeParticipantFacepile({ summary }) {
  if (!summary || !Number.isInteger(summary.count) || summary.count < 0) return null;
  const members = (Array.isArray(summary.members) ? summary.members : [])
    .filter(member => member?.verified === true && member.username && member.name)
    .slice(0, 3);
  return <div className="bw-challenge-participants" aria-label="Public Challenge participants">
    {members.length > 0 && <AvatarGroup className="bw-challenge-participant-facepile"
      label="Publicly participating members" max={3}>
      {members.map(member => <ParticipantAvatar key={member.username} member={member} />)}
    </AvatarGroup>}
    <span className="bw-challenge-participant-count">
      {summary.count > 0
        ? `${summary.count.toLocaleString()} ${summary.count === 1 ? "participant" : "participants"}`
        : "No public participants yet"}
    </span>
  </div>;
}
