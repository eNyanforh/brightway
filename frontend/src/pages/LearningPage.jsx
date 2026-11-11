import MyCampus from "../components/grade-school/MyCampus";
import CampusLearningTabs from "../components/grade-school/CampusLearningTabs";
import { countries, countryName } from "../components/learning/countries";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { learningApi as api } from "../api/learning";
import { STUDY_MODES } from "../../../shared/learning.mjs";
import ProgramCard from "../components/learning/ProgramCard";
import MyApplications from "../components/learning/MyApplications";
import VerificationBadge from "../components/VerificationBadge";
import "../components/opportunities/opportunities.css";
import "../components/learning/learning.css";
export default function LearningPage() {
  const { account } = useAuth(), [params, setParams] = useSearchParams();
  const view = params.get("view");
  const applications = view === "applications", campus = view === "campus" || view === "guardians";
  const kind = ["institutions", "admissions"].includes(params.get("kind")) ? params.get("kind") : "programs";
  const filters = { kind, q: (params.get("q") || "").slice(0, 80), countryCode: params.get("countryCode") || "", location: (params.get("location") || "").slice(0, 180), studyMode: params.get("studyMode") || "" };
  return <section className="bw-op-page bw-learn-page">{!campus && <header className="bw-learn-hero"><p className="bw-op-eyebrow">LEARNING · DISCOVER</p><h1>Find where your future begins.</h1><p>Explore institutions, education and training programs, and open applications around the world.</p><div className="bw-learn-hero-tags"><span>Global discovery</span><span>Verified providers</span><span>Apply on BrightWay</span></div></header>}
    <nav className="bw-op-tabs" aria-label="Learning views"><button type="button" aria-pressed={!applications && !campus} onClick={() => setParams({})}>Discover</button><button type="button" aria-pressed={applications} onClick={() => setParams({ view: "applications" })}>My applications</button><CampusLearningTabs key={account.id} view={view} onSelect={view => setParams({ view })} /></nav>
    {campus ? <MyCampus key={account.id + view} guardians={view === "guardians"} /> : applications ? <MyApplications key={account.id} /> : <><form key={params.toString()} className="bw-learn-filters" role="search" aria-label="Discover education" onSubmit={e => { e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget)); setParams(Object.fromEntries(Object.entries({ kind, ...data }).filter(([, v]) => v))); }}>
      <label>Search<input type="search" name="q" defaultValue={filters.q} maxLength={80} placeholder="Program, institution, or field" /></label><label>Country<select name="countryCode" defaultValue={filters.countryCode}><option value="">All countries</option>{countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label><label>City or location<input name="location" defaultValue={filters.location} maxLength={180} placeholder="Any location" /></label><label>Study mode<select name="studyMode" defaultValue={filters.studyMode}><option value="">All modes</option>{Object.entries(STUDY_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><button className="bw-op-primary" type="submit">Search</button></form>
      <nav className="bw-op-filters" aria-label="Discover categories">{[["programs", "Programs"], ["institutions", "Institutions"], ["admissions", "Open applications"]].map(([k, v]) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setParams(Object.fromEntries(Object.entries({ ...filters, kind: k }).filter(([, v]) => v)))}>{v}</button>)}</nav>
      <LearningResults key={account.id + JSON.stringify(filters)} filters={filters} /></>}
  </section>;
}
export function LearningResults({ filters, compact = false }) {
  const [page, setPage] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false), [retry, setRetry] = useState(0);
  const request = useRef(null), lock = useRef(false), filterKey = JSON.stringify(filters);
  useEffect(() => { const c = new AbortController(); request.current = c; api.browse(JSON.parse(filterKey), c.signal).then(data => { if (!c.signal.aborted) { setPage(data); setError(null); } }).catch(e => { if (!c.signal.aborted) setError(e); }); return () => request.current?.abort(); }, [filterKey, retry]);
  async function more() { if (lock.current) return; lock.current = true; setBusy(true); const c = new AbortController(); request.current = c;
    try { const data = await api.browse({ ...filters, cursor: page.nextCursor }, c.signal); if (!c.signal.aborted) { setPage(old => ({ ...data, items: [...old.items, ...data.items] })); setError(null); } } catch (e) { if (!c.signal.aborted) setError(e); } finally { if (!c.signal.aborted) { lock.current = false; setBusy(false); } } }
  return <div aria-live="polite">{error && <div role="alert" className="bw-op-feedback"><p>{error.message}</p><button type="button" disabled={busy} onClick={() => setRetry(v => v + 1)}>Try again</button></div>}{!page && !error && <p role="status">Finding your next learning opportunity…</p>}{page?.items.length === 0 && <div className="bw-op-empty"><h2>No matches yet</h2><p>Try another field, location, or country. New programs appear as institutions publish them.</p></div>}
    <div className="bw-learn-grid">{(compact ? page?.items.slice(0, 2) : page?.items)?.map(row => filters.kind === "programs" ? <ProgramCard key={row.id} program={row} /> : filters.kind === "institutions" ? <article key={row.id} className="bw-learn-card"><p className="bw-op-eyebrow">VERIFIED PROVIDER</p><h3><Link to={`/organizations/${row.id}`}>{row.name}</Link> <VerificationBadge kind="organization" /></h3><p>{row.request.city}, {countryName(row.request.countryCode)}</p><Link to={`/organizations/${row.id}`}>View institution →</Link></article> : <article className="bw-learn-card" key={row.id}><span className="bw-learn-open">Applications open</span><p>{row.organization.name}</p><h3>{row.program.title}</h3><p>{row.title}</p><p>{row.program.location}, {countryName(row.program.countryCode)} · {STUDY_MODES[row.program.studyMode]}</p><p>Apply by {new Date(row.deadline).toLocaleDateString("en-GB")}</p><Link className="bw-learn-link" to={`/learning/cycles/${row.id}`}>View & apply →</Link></article>)}</div>
    {!compact && page?.nextCursor && <button className="bw-op-secondary" type="button" disabled={busy} onClick={() => void more()}>{busy ? "Loading…" : "Show more"}</button>}
  </div>;
}
