import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { memberPhotoUrl } from "../../api/organization-posts";
import VerificationBadge from "../VerificationBadge";
import PostTimestamp from "./PostTimestamp";

function initialsFor(value) {
  return String(value || "Member").trim().split(/\s+/).slice(0, 2)
    .map(part => part[0]).join("").toUpperCase();
}

/** Common, compact publisher treatment for posts, answers and replies. */
export default function DiscussionAuthor({ entry, compact = false }) {
  const [failedPhoto, setFailedPhoto] = useState(null);
  const username = entry.username || "";
  const name = entry.name || (username ? "@" + username : "BrightWay member");
  const profileUrl = username ? "/people/" + encodeURIComponent(username) : null;
  // Public photos are deliberately only displayed with server-approved identity metadata.
  const photo = entry.verified === true && entry.photoId && username
    ? memberPhotoUrl(username, entry.photoId) : null;
  const canShowPhoto = photo && failedPhoto !== photo;

  useEffect(() => setFailedPhoto(null), [photo]);

  const avatar = (
    <span className="bw-discussion-avatar" aria-hidden="true">
      {canShowPhoto
        ? <img src={photo} alt="" loading="lazy" onError={() => setFailedPhoto(photo)} />
        : initialsFor(entry.name || username)}
    </span>
  );
  return (
    <div className={"bw-discussion-author" + (compact ? " bw-discussion-author--compact" : "")}>
      {profileUrl
        ? <Link className="bw-discussion-avatar-link" to={profileUrl} tabIndex={-1} aria-hidden="true">{avatar}</Link>
        : avatar}
      <div className="bw-discussion-author-info">
        <div className="bw-discussion-author-title">
          {profileUrl ? <Link to={profileUrl}>{name}</Link> : <strong>{name}</strong>}
          {entry.verified === true && <VerificationBadge />}
          {entry.canDelete && <span className="bw-discussion-you">You</span>}
        </div>
        <div className="bw-discussion-author-meta">
          {entry.name && username && <span>@{username}</span>}
          {entry.createdAt && <PostTimestamp createdAt={entry.createdAt} />}
        </div>
      </div>
    </div>
  );
}
