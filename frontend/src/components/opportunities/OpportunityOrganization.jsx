import { Link } from "react-router-dom";
import OrganizationAvatar from "../profile/OrganizationAvatar";
import VerificationBadge from "../VerificationBadge";

// Organization verification comes from the current server record, not the artwork.
export default function OpportunityOrganization({ organization, inverse = false }) {
  if (!organization) return null;
  const photoUrl = organization.profilePhotoId
    ? `/api/v1/organizations/${encodeURIComponent(organization.id)}/photo/${encodeURIComponent(organization.profilePhotoId)}`
    : null;
  return <div className={`bw-op-publisher${inverse ? " bw-op-publisher-inverse" : ""}`}>
    <Link to={`/organizations/${organization.id}`} aria-label={`View ${organization.name} organization profile`}>
      <OrganizationAvatar organization={{ ...organization, photoUrl }} icon="briefcase" className="bw-op-publisher-avatar" />
    </Link>
    <span className="bw-op-publisher-name">
      <Link to={`/organizations/${organization.id}`}>{organization.name}</Link>
      {Boolean(organization.verifiedAt) && <VerificationBadge kind="organization" />}
    </span>
  </div>;
}
