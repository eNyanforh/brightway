import { useState } from "react";
import { memberPhotoUrl } from "../../api/organization-posts";
import { organizationPictureUrl } from "../../api/organization-profile";

const initials = name => String(name || "?").trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();

export default function NetworkAvatar({ person, kind = "PERSON", large = false }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const organization = kind === "ORGANIZATION";
  const source = organization
    ? person?.organizationId && person?.profilePhotoId
      ? organizationPictureUrl(person.organizationId, person.profilePhotoId)
      : null
    : person?.username && person?.photoId
      ? memberPhotoUrl(person.username, person.photoId)
      : null;
  const name = person?.fullName || person?.username || "Account";
  return <span className={`bw-network-avatar${large ? " bw-network-avatar-large" : ""}`}>
    {source && failedUrl !== source
      ? <img src={source} alt={name + " profile picture"} loading="lazy" onError={() => setFailedUrl(source)} />
      : <span aria-hidden="true">{initials(name)}</span>}
  </span>;
}
