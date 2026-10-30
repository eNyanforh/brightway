import VerificationBadge from "../components/VerificationBadge";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { organizationsApi as api } from "../api/organizations";
import "./organizations.css";
export default function OrganizationPage() {
  const { id } = useParams();
  return <PublicOrganization key={id} id={id} />;
}
function PublicOrganization({ id }) {
  const [view, setView] = useState(null), [error, setError] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    api.publicOrganization(id, controller.signal).then(data => { if (!controller.signal.aborted) setView({ id, data }); }).catch(e => { if (!controller.signal.aborted) setError(e); });
    return () => controller.abort();
  }, [id]);
  const data = view?.id === id ? view.data : null;
  return <section className="bw-org-page">{error && <p role="alert">{error.message}</p>}{!data && !error && <p role="status">Loading organization…</p>}{data && <>{data.photo?.url && <img src={data.photo.url} alt={`${data.name} profile picture`} width="96" height="96" style={{ objectFit: "cover", borderRadius: 16 }} />}<h1>{data.name} {data.verified === true && <VerificationBadge kind="organization" />}</h1>{data.username && <p>@{data.username}</p>}<p>{data.type} · Verified organization</p>{data.offersTraining && <p>Offers education or training.</p>}{(data.phoneNumber || data.contactEmail || data.website) && <><h2>Contact information</h2>{data.phoneNumber && <p><a href={`tel:${data.phoneNumber}`}>{data.phoneNumber}</a></p>}{data.contactEmail && <p><a href={`mailto:${data.contactEmail}`}>{data.contactEmail}</a></p>}{data.website && <p><a href={data.website} target="_blank" rel="noopener noreferrer">{data.website}</a></p>}</>}<h2>Operating location</h2>{data.locations.map((location, index) => <p key={index}>{[location.address, location.city, location.region, location.countryCode].filter(Boolean).join(", ")}</p>)}</>}</section>;
}
