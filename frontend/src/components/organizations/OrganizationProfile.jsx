import { useEffect, useState } from "react";
import { organizationsApi } from "../../api/organizations";
import WorkspaceIcon from "../workspace/WorkspaceIcon";
import "./organization-profile.css";
const typeLabels = { SCHOOL: "School", NGO: "NGO", COMPANY: "Company" };
const regions = new Intl.DisplayNames(["en"], { type: "region" });
const countryName = code => { try { return regions.of(code) || code; } catch { return code; } };
export default function OrganizationProfile({ organization, role }) {
  const [data, setData] = useState(null), [error, setError] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    organizationsApi.publicOrganization(organization.id, controller.signal).then(next => {
      if (controller.signal.aborted) return;
      if (next?.id !== organization.id || typeof next.name !== "string" || !Array.isArray(next.locations)) throw Error("Organization profile is unavailable. Reload to try again.");
      setData(next);
    }).catch(error => { if (!controller.signal.aborted) setError(error); });
    return () => controller.abort();
  }, [organization.id]);
  if (error) return <p role="alert">{error.message}</p>;
  if (!data) return <p role="status">Loading organization profile…</p>;
  const initials = data.name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase();
  return <div className="bw-organization-profile">
    <section className="bw-organization-profile-hero" aria-labelledby="organization-profile-name">
      <div className="bw-organization-cover" aria-hidden="true"><WorkspaceIcon name="building" size={110} /></div>
      <div className="bw-organization-profile-identity"><span className="bw-organization-avatar" role="img" aria-label={`${data.name} — organization image placeholder`}>{initials}</span>
        <div className="bw-organization-profile-actions"><a href={`/organizations/${data.id}`} target="_blank" rel="noopener noreferrer">View public profile<WorkspaceIcon name="arrow" size={16} /></a></div>
        <div className="bw-organization-profile-name"><h2 id="organization-profile-name">{data.name}</h2>{data.verified === true && <span className="bw-organization-verified" aria-label="Verified organization"><WorkspaceIcon name="check" size={14} /></span>}</div>
        <p className="bw-organization-subtitle">{typeLabels[data.type] || "Organization"}{data.offersTraining && " · Education and training"}</p>
        {data.locations[0] && <p className="bw-organization-location"><WorkspaceIcon name="building" size={15} />{[data.locations[0].city, countryName(data.locations[0].countryCode)].filter(Boolean).join(", ")}</p>}
        <span className="bw-organization-your-role">Your role: {role === "PRIMARY_ADMIN" ? "Primary administrator" : "Staff"}</span>
      </div>
    </section>
    <div className="bw-organization-profile-grid"><section className="bw-organization-profile-section"><h2>Organization details</h2><dl><div><dt>Organization type</dt><dd>{typeLabels[data.type] || data.type}</dd></div><div><dt>Education or training</dt><dd>{data.offersTraining ? "Offered" : "Not offered"}</dd></div><div><dt>Verification</dt><dd>{data.verified === true ? "Verified organization" : "Not verified"}</dd></div></dl></section>
      <section className="bw-organization-profile-section"><h2>Operating locations</h2>{data.locations.length ? data.locations.map((location, index) => <div className="bw-organization-location-card" key={index}><span>{location.primary ? "Primary location" : "Operating location"}</span><p>{[location.address, location.city, location.region, countryName(location.countryCode)].filter(Boolean).join(", ")}</p></div>) : <p>No operating locations available.</p>}</section></div>
  </div>;
}
