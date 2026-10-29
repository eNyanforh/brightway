import { useEffect, useState } from "react";
import { organizationsApi } from "../../api/organizations";
import { organizationProfileApi } from "../../api/organization-profile";
import OrganizationProfileEditor from "./OrganizationProfileEditor";
import WorkspaceIcon from "../workspace/WorkspaceIcon";
import "./organization-profile.css";
const typeLabels = { SCHOOL: "School", NGO: "NGO", COMPANY: "Company" };
const regions = new Intl.DisplayNames(["en"], { type: "region" });
const countryName = code => { try { return regions.of(code) || code; } catch { return code; } };
export default function OrganizationProfile({ organization, role, canEdit = false }) {
  const [data, setData] = useState(null), [error, setError] = useState(null), [editing, setEditing] = useState(null), [opening, setOpening] = useState(false), [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    organizationsApi.publicOrganization(organization.id, controller.signal).then(next => {
      if (controller.signal.aborted) return;
      if (next?.id !== organization.id || typeof next.name !== "string" || !Array.isArray(next.locations)) throw Error("Organization profile is unavailable. Reload to try again.");
      setData(next);
    }).catch(error => { if (!controller.signal.aborted) setError(error); });
    return () => controller.abort();
  }, [organization.id, revision]);
  async function edit() {
    if (opening) return;
    setOpening(true); setError(null);
    try { const profile = await organizationProfileApi.read(organization.id); if (profile.canEdit) setEditing(profile); else throw new Error("Organization profile-management permission is required."); }
    catch (error) { setError(error); }
    finally { setOpening(false); }
  }
  if (error && !data) return <p role="alert">{error.message}</p>;
  if (!data) return <p role="status">Loading organization profile…</p>;
  const initials = data.name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase();
  return <div className="bw-organization-profile">
    {error && <p role="alert">{error.message}</p>}
    {editing && <OrganizationProfileEditor profile={editing} onClose={() => setEditing(null)} onSaved={saved => { setData(previous => ({ ...previous, username: saved.username, photo: saved.photo })); setEditing(null); setRevision(value => value + 1); }} />}
    <section className="bw-organization-profile-hero" aria-labelledby="organization-profile-name">
      <div className="bw-organization-cover" aria-hidden="true"><WorkspaceIcon name="building" size={110} /></div>
      <div className="bw-organization-profile-identity"><span className="bw-organization-avatar">{data.photo?.url ? <img src={data.photo.url} alt={`${data.name} profile picture`} /> : <span role="img" aria-label={`${data.name} — organization image placeholder`}>{initials}</span>}</span>
        {canEdit && <div className="bw-organization-profile-actions"><button type="button" disabled={opening} onClick={edit}>{opening ? "Opening…" : "Edit Profile"}</button></div>}
        <div className="bw-organization-profile-name"><h1 id="organization-profile-name">{data.name}</h1>{data.verified === true && <span className="bw-organization-verified" aria-label="Verified organization"><WorkspaceIcon name="check" size={14} /></span>}</div>
        {data.username && <p className="bw-organization-username">@{data.username}</p>}
        <p className="bw-organization-subtitle">{typeLabels[data.type] || "Organization"}{data.offersTraining && " · Education and training"}</p>
        {data.locations[0] && <p className="bw-organization-location"><WorkspaceIcon name="building" size={15} />{[data.locations[0].city, countryName(data.locations[0].countryCode)].filter(Boolean).join(", ")}</p>}
        <span className="bw-organization-your-role">Your role: {role === "PRIMARY_ADMIN" ? "Primary administrator" : "Staff"}</span>
      </div>
    </section>
    <div className="bw-organization-profile-grid"><section className="bw-organization-profile-section"><h2>Organization details</h2><dl><div><dt>Organization type</dt><dd>{typeLabels[data.type] || data.type}</dd></div><div><dt>Education or training</dt><dd>{data.offersTraining ? "Offered" : "Not offered"}</dd></div><div><dt>Verification</dt><dd>{data.verified === true ? "Verified organization" : "Not verified"}</dd></div></dl></section>
      <section className="bw-organization-profile-section"><h2>Operating locations</h2>{data.locations.length ? data.locations.map((location, index) => <div className="bw-organization-location-card" key={index}><span>{location.primary ? "Primary location" : "Operating location"}</span><p>{[location.address, location.city, location.region, countryName(location.countryCode)].filter(Boolean).join(", ")}</p></div>) : <p>No operating locations available.</p>}</section></div>
  </div>;
}
