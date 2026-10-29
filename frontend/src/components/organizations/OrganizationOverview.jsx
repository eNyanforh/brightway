import { Link } from "react-router-dom";
export default function OrganizationOverview({ workspace, organization, role }) {
  return <div className="bw-org-overview">
    <header className="bw-org-overview-intro"><p className="bw-org-eyebrow">ORGANIZATION WORKSPACE</p><h2>Dashboard</h2><p>You are acting for <strong>{organization.name}</strong> as {role === "PRIMARY_ADMIN" ? "the primary administrator" : "an organization staff member"}. This workspace shows only the tools available to your current role. Organization work stays separate from your personal profile.</p></header>
    <h2>Available to you</h2>
    <div className="bw-org-tool-grid">{workspace.available.filter(item => item.key !== "dashboard").map(item => <article key={item.key} className="bw-org-tool"><h3>{item.label}</h3><p>{item.description}</p>{item.sensitive && <small>Current permission and two-factor authentication are required.</small>}{item.external ? <a href={item.to} target="_blank" rel="noopener noreferrer">View public organization</a> : <Link to={item.to}>Open {item.label}</Link>}</article>)}</div>
    {(organization.type === "SCHOOL" || organization.offersTraining) && !workspace.campusActive && <section className="bw-org-campus-boundary"><h2>Virtual Campus</h2><p>Campus academic tools and Campus billing require a qualifying verified Liberia operation and an active Campus. Organization approval, program publication and admission acceptance do not activate or bill Campus.</p>{workspace.campusSetup && <Link className="bw-org-workspace-entry bw-campus-mobile-entry" to={workspace.campusSetup.to}>Build Campus<span> · Coming soon</span></Link>}</section>}
  </div>;
}
