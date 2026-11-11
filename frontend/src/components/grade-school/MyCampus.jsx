import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { schoolApi as api } from "../../api/grade-school";
import AcademicReport from "./AcademicReport";
import "./grade-school.css";
export default function MyCampus({ guardians = false }) {
  const [page, setPage] = useState(null), [report, setReport] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
  const lock = useRef(false), life = useRef(null);
  useEffect(() => { const c = new AbortController(); life.current = c;
    (guardians ? api.guardians(c.signal) : api.myCampus(c.signal)).then(data => { if (!c.signal.aborted) { setPage({ guardians, data }); setError(null); } }).catch(e => { if (!c.signal.aborted) { setPage(null); setReport(null); setError(e); } });
    return () => c.abort();
  }, [guardians, revision]);
  const data = page?.guardians === guardians ? page.data : null;
  async function readReport(id) {
    if (lock.current) return; lock.current = true; setBusy(true); const c = life.current; setError(null); setReport(null);
    try { const result = await (guardians ? api.guardianReport(id, c.signal) : api.myReport(id, c.signal)); if (!c.signal.aborted) setReport(result); }
    catch (e) { if (!c.signal.aborted) setError(e); }
    finally { lock.current = false; if (!c.signal.aborted) setBusy(false); }
  }
  async function decision(row, value) {
    if (lock.current) return; lock.current = true; setBusy(true); const c = life.current; setError(null);
    try { await api.guardianDecision(row.id, { expectedVersion: row.version, decision: value }); if (!c.signal.aborted) { setReport(null); setRevision(v => v + 1); } }
    catch (e) { if (!c.signal.aborted) setError(e); }
    finally { lock.current = false; if (!c.signal.aborted) setBusy(false); }
  }
  return <div className="bw-school-root bw-school-personal"><header className="bw-school-heading"><div><p className="bw-school-eyebrow">{guardians ? "PARENTS & GUARDIANS" : "LEARNING / MY CAMPUS"}</p><h2>{guardians ? "Guardian access" : "My Campus"}</h2><p>{guardians ? "Confirm your school's request to view authorized student records." : "Your school timetable, finalized results, attendance and announcements."}</p></div></header>
    {error && <div role="alert" className="bw-school-feedback bw-school-error"><p>{error.message}</p><button disabled={busy} type="button" onClick={() => setRevision(v => v + 1)}>Retry Campus</button></div>}
    {!data && !error && <p role="status">Loading your Campus access…</p>}
    {data?.items.length === 0 && <div className="bw-school-empty"><h3>{guardians ? "No guardian requests" : "No student Campus registrations"}</h3><p>{guardians ? "Your school must authorize a relationship before you can confirm access." : "School administrators register students for each academic period. Teachers use their organization workspace."}</p><Link to="/learning">Discover programs</Link></div>}
    <div className="bw-school-campus-list">{data?.items.map(row => <article key={row.id} className="bw-school-campus-item"><p className="bw-school-eyebrow">{guardians ? row.relationship : row.year}</p><h3>{row.schoolName}</h3><span className={"bw-school-state bw-school-state-" + row.status.toLowerCase()}>{row.status.replaceAll("_", " ")}</span>
      {guardians ? <><p>{row.student.fullName}</p>{row.status === "PENDING" ? <><p>Confirm this relationship only if you are the authorized parent or guardian.</p><div className="bw-school-actions"><button className="bw-school-primary" disabled={busy} type="button" onClick={() => void decision(row, "CONFIRM")}>Confirm guardian relationship</button><button disabled={busy} type="button" onClick={() => void decision(row, "REVOKE")}>Decline request</button></div></> : <><div className="bw-school-actions">{row.registrations.filter(r => r.status === "ACTIVE").map(r => <button key={r.id} type="button" disabled={busy} onClick={() => void readReport(r.id)}>View {r.period} student report</button>)}</div><button type="button" disabled={busy} onClick={() => void decision(row, "REVOKE")}>Revoke my guardian access</button></>}</> : <><p>{row.period} · {row.section}</p>{row.status === "PRE_REGISTERED" ? <><p>{row.message}</p><Link to="/explore">Come Later</Link></> : row.status === "ACTIVE" && row.studentStatus === "ACTIVE" && row.available !== false ? <button className="bw-school-primary" type="button" disabled={busy} onClick={() => void readReport(row.id)}>Open my Campus</button> : <p>Campus access is unavailable for this registration. Contact the school administration.</p>}</>}
    </article>)}</div>
    {report && <AcademicReport data={report} onClose={() => setReport(null)} />}
  </div>;
}
