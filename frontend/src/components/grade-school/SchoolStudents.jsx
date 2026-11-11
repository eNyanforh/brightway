import { useEffect, useRef, useState } from "react";
import { schoolApi as api } from "../../api/grade-school";
import SchoolForm from "./SchoolForm";
import AcademicReport from "./AcademicReport";
function AcceptedAdmissionPicker({ campusId, onSelect, busy }) {
  const [page, setPage] = useState(null), [q, setQ] = useState(""), [draft, setDraft] = useState(""), [cursor, setCursor] = useState(""), [error, setError] = useState(null);
  useEffect(() => { const c = new AbortController();
    api.admissions(campusId, { q, cursor }, c.signal).then(data => { if (!c.signal.aborted) { setPage({ ...data, q, cursor }); setError(null); } }).catch(e => { if (!c.signal.aborted) { setPage(null); setError(e); } });
    return () => c.abort();
  }, [campusId, q, cursor]);
  const current = page?.q === q && page.cursor === cursor ? page : null;
  return <div className="bw-school-admission-picker"><label>Find accepted applicant<input value={draft} disabled={busy} maxLength={80} onChange={e => setDraft(e.target.value)} placeholder="Name or username" /></label><button type="button" disabled={busy} onClick={() => { onSelect(null); setCursor(""); setQ(draft.trim()); }}>Find accepted admissions</button>
    {error && <p role="alert">{error.message}</p>}
    <label>Accepted admission<select name="admissionId" key={q + cursor} required disabled={busy || !current} defaultValue="" onChange={e => onSelect(current.items.find(a => a.id === e.target.value))}><option value="">Select an accepted applicant</option>{current?.items.map(a => <option key={a.id} value={a.id}>{a.applicant.fullName} (@{a.applicant.username}) · {a.cycleTitle}</option>)}</select></label>
    {current && !current.items.length && <p>No unregistered accepted admissions match this search.</p>}
    {current?.nextCursor && <button type="button" disabled={busy} onClick={() => { onSelect(null); setCursor(current.nextCursor); }}>Next accepted admissions</button>}{cursor && <button type="button" disabled={busy} onClick={() => { onSelect(null); setCursor(""); }}>First accepted admissions</button>}
  </div>;
}
function RegistrationForm({ campusId, data, sections, busy, run }) {
  const [source, setSource] = useState("DIRECT"), [section, setSection] = useState(""), [admission, setAdmission] = useState(null);
  return <form className="bw-school-form" aria-label="Register a student" onSubmit={async e => { e.preventDefault(); const form = e.currentTarget, f = new FormData(form); if (await run(() => api.register(campusId, { username: source === "ADMISSION" ? admission?.applicant.username : f.get("username"), periodId: data.periodId, sectionId: section, source, admissionId: source === "ADMISSION" ? admission?.id : null, electiveIds: f.getAll("electiveIds") }), "Student pre-registered. Activate the registration when requirements are complete.")) { form.reset(); setSource("DIRECT"); setSection(""); setAdmission(null); } }}>
    <h4>Register a student</h4><p className="bw-school-help">Use an existing BrightWay identity. An accepted admission remains separate from official registration.</p>
    <div className="bw-school-fields">{source !== "ADMISSION" && <label>Student username<input name="username" required maxLength={30} disabled={busy} placeholder="BrightWay username" /></label>}<label>Registration route<select value={source} disabled={busy} onChange={e => { setSource(e.target.value); setAdmission(null); }}><option value="DIRECT">Direct registration</option><option value="ADMISSION">Accepted admission</option><option value="RETURNING">Returning student</option></select></label>
      <label>Student section<select value={section} required disabled={busy} onChange={e => setSection(e.target.value)}><option value="">Select section</option>{sections.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
      {source === "ADMISSION" && <AcceptedAdmissionPicker campusId={campusId} onSelect={setAdmission} busy={busy} />}
      <label>Elective subjects (optional)<select key={section} name="electiveIds" multiple disabled={busy}>{data.offerings.filter(o => o.sectionId === section && o.mode === "ELECTIVE").map(o => <option key={o.id} value={o.id}>{o.subject.name}</option>)}</select><small>Compulsory subjects are included automatically.</small></label></div>
    <button className="bw-school-primary" disabled={busy || !data.periodId || source === "ADMISSION" && !admission} type="submit">Confirm registration</button>
  </form>;
}
const transitions = { PRE_REGISTERED: [["ACTIVE", "Activate registration"], ["FORMER", "Mark former"]], ACTIVE: [["SUSPENDED", "Suspend registration"], ["FORMER", "Mark former"]], SUSPENDED: [["ACTIVE", "Restore registration"], ["FORMER", "Mark former"]], FORMER: [] };
export default function SchoolStudents({ campusId, data, sections, busy, run, revision }) {
  const [page, setPage] = useState(null), [error, setError] = useState(null), [q, setQ] = useState(""), [cursor, setCursor] = useState(""), [history, setHistory] = useState([]), [selected, setSelected] = useState(null), [report, setReport] = useState(null);
  const life = useRef(null);
  useEffect(() => { const c = new AbortController(); life.current = c;
    api.registrations(campusId, { periodId: data.periodId, q, cursor }, c.signal).then(result => { if (!c.signal.aborted) { setPage({ result, q, cursor }); setError(null); } }).catch(e => { if (!c.signal.aborted) { setError(e); setPage(null); } });
    return () => c.abort();
  }, [campusId, data.periodId, q, cursor, revision]);
  const current = page?.q === q && page.cursor === cursor ? page.result : null;
  const student = current?.items.find(r => r.id === selected);
  async function readReport(r) { const c = life.current; try { const value = await api.report(campusId, r.id, c.signal); if (!c.signal.aborted) { setReport(value); setError(null); } } catch (e) { if (!c.signal.aborted) { setReport(null); setError(e); } } }
  return <div className="bw-school-students"><section className="bw-school-card"><RegistrationForm campusId={campusId} data={data} sections={sections} busy={busy} run={run} /></section>
    <section className="bw-school-card"><div className="bw-school-section-heading"><div><h4>Student registrations</h4><p>Placement and access are specific to the selected academic period.</p></div><form className="bw-school-search" onSubmit={e => { e.preventDefault(); setQ(new FormData(e.currentTarget).get("q").trim()); setCursor(""); setHistory([]); setSelected(null); setReport(null); }}><label>Find a student<input name="q" maxLength={80} placeholder="Name or username" disabled={busy} /></label><button type="submit" disabled={busy}>Search</button></form></div>
      {error && <p role="alert">{error.message}</p>}{!current && !error && <p role="status">Loading student registrations…</p>}
      {current && <><div className="bw-school-table-wrap"><table><caption>Registered students</caption><thead><tr><th>Student</th><th>Class / section</th><th>Registration</th><th>Actions</th></tr></thead><tbody>{current.items.map(r => <tr key={r.id}><th scope="row"><strong>{r.student.account.fullName}</strong><small>@{r.student.account.username}</small></th><td>{r.section.schoolClass.name} / {r.section.name}</td><td><span className={"bw-school-state bw-school-state-" + r.status.toLowerCase()}>{r.status.replaceAll("_", " ")}</span></td><td><div className="bw-school-actions"><button type="button" disabled={busy} onClick={() => { setSelected(r.id); setReport(null); }}>Manage student</button><button type="button" disabled={busy} onClick={() => void readReport(r)}>View report</button></div></td></tr>)}</tbody></table></div>{!current.items.length && <p className="bw-school-empty">No students are registered in this period yet.</p>}
        <div className="bw-school-pager"><button disabled={busy || !history.length} onClick={() => { setCursor(history[history.length - 1]); setHistory(old => old.slice(0, -1)); setSelected(null); }}>Previous</button><button disabled={busy || !current.nextCursor} onClick={() => { setHistory(old => [...old, cursor]); setCursor(current.nextCursor); setSelected(null); }}>Next</button></div></>}
    </section>
    {student && <section className="bw-school-card" aria-label="Manage selected student"><div className="bw-school-section-heading"><div><p className="bw-school-eyebrow">STUDENT RECORD</p><h4>{student.student.account.fullName}</h4><p>{student.period.name} · {student.source.toLowerCase()} registration</p></div><button onClick={() => setSelected(null)} type="button">Close student</button></div>
      <p>Registration: {student.status.replaceAll("_", " ")}</p><div className="bw-school-actions">{transitions[student.status].map(([status, label]) => <button type="button" key={status} disabled={busy} onClick={() => run(() => api.status(campusId, "registrations", student.id, { expectedVersion: student.version, status }))}>{label}</button>)}</div>
      <details className="bw-school-detail"><summary>School membership: {student.student.status.replaceAll("_", " ")}</summary><p>Membership suspension blocks every period. Existing academic records remain available to school administrators.</p><div className="bw-school-actions">{(student.student.status === "ACTIVE" ? [["SUSPENDED", "Suspend membership"], ["FORMER", "Mark membership former"]] : student.student.status === "PRE_REGISTERED" ? [] : [["ACTIVE", "Restore membership"]]).map(([status, label]) => <button type="button" disabled={busy} key={status} onClick={() => run(() => api.status(campusId, "students", student.studentId, { status, expectedVersion: student.student.version }))}>{label}</button>)}</div></details>
      <SchoolForm title="Authorize a parent or guardian" description="The guardian must confirm the school's request before receiving student records or absence alerts." busy={busy} action="Request guardian confirmation" fields={[{ name: "username", label: "Guardian username", maxLength: 30 }, { name: "relationship", label: "Relationship", maxLength: 60, placeholder: "Parent or legal guardian" }]} onSubmit={f => run(() => api.guardian(campusId, { studentId: student.studentId, username: f.get("username"), relationship: f.get("relationship") }))} />
      <ul className="bw-school-items">{current.guardians.filter(g => g.studentId === student.studentId).map(g => <li key={g.id}><div><strong>{g.guardian.fullName}</strong><small>{g.relationship} · {g.status.toLowerCase()}</small></div>{g.status !== "REVOKED" && <button disabled={busy} onClick={() => run(() => api.revokeGuardian(campusId, g.id, g.version))} type="button">Revoke guardian</button>}</li>)}</ul>
    </section>}
    {report && <AcademicReport data={report} onClose={() => setReport(null)} />}
  </div>;
}
