import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { OPPORTUNITY_TYPES } from "../../../shared/opportunities.mjs";
import NavigationIcon from "../components/layout/NavigationIcon";
import OpportunityBrowser from "../components/opportunities/OpportunityBrowser";
import MyApplications from "../components/opportunities/MyApplications";
export default function OpportunitiesPage() {
  const { account } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get("view") === "applications" ? "applications" : "discover";
  const type = Object.hasOwn(OPPORTUNITY_TYPES, params.get("type")) ? params.get("type") : "";
  const q = (params.get("q") || "").slice(0, 80);
  return <section className="bw-op-page">
    <h1 className="bw-module-title">Opportunities</h1>
    <nav className="bw-op-tabs" aria-label="Opportunity views">{[["discover", "Discover"], ["applications", "My applications"]].map(([value, label]) => <button key={value} type="button" aria-pressed={tab === value} onClick={() => setParams(value === "applications" ? { view: value } : {})}>{label}</button>)}</nav>
    {tab === "applications" ? <MyApplications key={account.id} /> : <>
      <form className="bw-op-search" role="search" aria-label="Search opportunities" onSubmit={e => { e.preventDefault(); const value = new FormData(e.currentTarget).get("q"); setParams({ ...(type ? { type } : {}), ...(value ? { q: value } : {}) }); }}><NavigationIcon name="search" size={20} /><input key={q} type="search" name="q" maxLength={80} defaultValue={q} aria-label="Search opportunities" placeholder="Title, skill, organization, or location" /><button type="submit" className="bw-op-primary">Search</button></form>
      <nav className="bw-op-filters" aria-label="Opportunity types">{[["", "All opportunities"], ...Object.entries(OPPORTUNITY_TYPES).map(([k, v]) => [k, v.plural])].map(([value, label]) => <button key={value} type="button" aria-pressed={type === value} onClick={() => setParams({ ...(value ? { type: value } : {}), ...(q ? { q } : {}) })}>{label}</button>)}</nav>
      <OpportunityBrowser key={`${account.id}:${q}:${type}`} q={q} type={type} />
    </>}
  </section>;
}
