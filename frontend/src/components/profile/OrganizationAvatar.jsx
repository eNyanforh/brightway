import { useState } from "react";
import Icon from "../layout/Icon";

// Organization art is cosmetic. It never changes credential verification status.
export default function OrganizationAvatar({ organization, icon, className = "" }) {
  const [failed, setFailed] = useState(false);
  return organization?.photoUrl && !failed ? (
    <img className={className} src={organization.photoUrl}
      alt={organization.name + " profile picture"} loading="lazy"
      referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  ) : (
    <span className={className} aria-hidden="true"><Icon name={icon} /></span>
  );
}
