import { countryName } from "../components/learning/countries";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { learningApi as api } from "../api/learning";
import { useAuth } from "../auth/useAuth";
import { STUDY_MODES, PROGRAM_TYPES, CYCLE_STATUSES, cycleStatus } from "../../../shared/learning.mjs";
import VerificationBadge from "../components/VerificationBadge";
import "../components/opportunities/opportunities.css";
import "../components/learning/learning.css";
export default function ProgramDetailPage() {
  const { id } = useParams(), { account } = useAuth();
  return <Detail key={account.id + id} id={id} />;
}
function Detail({ id }) {
  const [data, setData] = useState(null), [error, setError] = useState(null), [retry, setRetry] = useState(0);
  useEffect(() => { const c = new AbortController(); api.program(id, c.signal).then(row => { if (!c.signal.aborted) { setData(row); setError(null); } }).catch(e => { if (!c.signal.aborted) setError(e); }); return () => c.abort(); }, [id, retry]);
  const p = data?.program;
  return <section className="bw-op-page bw-learn-page"><Link to="/learning" className="bw-op-back">← Discover programs</Link>{error && <div role="alert"><p>{error.message}</p><button type="button" onClick={() => setRetry(v => v + 1)}>Try again</button></div>}{!data && !error && <p role="status">Opening program…</p>}{p && <><header className="bw-learn-hero"><p className="bw-op-eyebrow">{PROGRAM_TYPES[p.type]} · {STUDY_MODES[p.studyMode]}</p><h1>{p.title}</h1><p>{p.organization.name} <VerificationBadge kind="organization" /></p><div className="bw-learn-hero-tags"><span>{p.field}</span><span>{p.duration}</span><span>{p.location}, {countryName(p.countryCode)}</span></div></header><div className="bw-op-detail-layout"><div><section className="bw-op-surface"><h2>About the program</h2><p className="bw-op-description">{p.description}</p></section><section className="bw-op-surface"><h2>Entry requirements</h2><p className="bw-op-description">{p.requirements}</p></section></div><aside className="bw-op-surface"><h2>Choose your intake</h2>{data.cycles.length === 0 && <p>No upcoming application periods. Check back for the next intake.</p>}{data.cycles.map(c => <article className="bw-learn-cycle" key={c.id}><span className="bw-op-status">{CYCLE_STATUSES[cycleStatus(c)]}</span><h3>{c.title}</h3><p>Opens {new Date(c.opensAt).toLocaleDateString("en-GB")}</p><p>Apply by {new Date(c.deadline).toLocaleDateString("en-GB")}</p><Link to={`/learning/cycles/${c.id}`}>{cycleStatus(c) === "OPEN" ? "View & apply →" : "View upcoming cycle →"}</Link></article>)}<p className="bw-learn-note">Acceptance and official institution registration are separate steps.</p></aside></div></>}</section>;
}
