import { useEffect, useRef, useState } from "react";
import { schoolApi as api } from "../../api/grade-school";
import SchoolForm from "./SchoolForm";
import SchoolStudents from "./SchoolStudents";
import SchoolTeaching from "./SchoolTeaching";
import "./grade-school.css";
const option = (value, label) => ({ value, label });
const values = form => Object.fromEntries(form);
export default function GradeSchoolWorkspace({ campusId }) {
  const [snapshot, setSnapshot] = useState(null), [period, setPeriod] = useState(""), [tab, setTab] = useState("setup"), [revision, setRevision] = useState(0);
  const [error, setError] = useState(null), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const lock = useRef(false), life = useRef(null);
  useEffect(() => {
    const controller = new AbortController(); life.current = controller;
    api.setup(campusId, period, controller.signal).then(data => { if (!controller.signal.aborted) { setSnapshot({ campusId, period, data }); setError(null); } }).catch(e => { if (!controller.signal.aborted) { setSnapshot(null); setError(e); } });
    return () => controller.abort();
  }, [campusId, period, revision]);
  const data = snapshot?.campusId === campusId && snapshot.period === period ? snapshot.data : null;
  async function run(task, message = "Academic changes saved.") {
    if (lock.current) return false;
    lock.current = true; setBusy(true); setError(null); setNotice(""); const current = life.current;
    try { await task(); if (current?.signal.aborted) return false; setRevision(v => v + 1); setNotice(message); return true; }
    catch (e) { if (!current?.signal.aborted) { setError(e); if ([401, 403, 404].includes(e.status)) setSnapshot(null); } return false; }
    finally { lock.current = false; if (!current?.signal.aborted) setBusy(false); }
  }
  if (!data) return <section className="bw-school-root"><h3>Grade School management</h3>{error ? <div role="alert"><p>{error.message}</p><button type="button" onClick={() => setRevision(v => v + 1)}>Retry school access</button></div> : <p role="status">Loading academic workspace…</p>}</section>;
  const periodId = data.periodId, activeTab = !data.canManage && ["setup", "students"].includes(tab) ? "teaching" : tab;
  const periods = data.years.flatMap(y => y.periods.map(p => option(p.id, y.name + " / " + p.name)));
  const sections = data.classes.flatMap(c => c.sections.map(v => option(v.id, c.name + " / " + v.name)));
  function configure(kind, form, transform = values) { return run(() => api.configure(campusId, kind, transform(form))); }
  return <section className="bw-school-root" aria-label="Grade School management"><header className="bw-school-heading"><div><p className="bw-school-eyebrow">GRADE SCHOOL / ACADEMICS</p><h3>{data.displayName}</h3><p>Every class, lesson and result belongs to an academic period.</p></div><span className="bw-school-role">{data.canManage ? "Academic administration" : "Assigned teaching"}</span></header>
    <div className="bw-school-toolbar"><nav aria-label="School management views">{[...(data.canManage ? [["setup", "Academic setup"], ["students", "Students & guardians"]] : []), ["teaching", "Teaching & attendance"]].map(([key, label]) => <button key={key} type="button" disabled={busy} aria-pressed={activeTab === key} onClick={() => { setTab(key); setNotice(""); }}>{label}</button>)}</nav><label>Academic period<select value={periodId || ""} disabled={busy} onChange={e => setPeriod(e.target.value)}><option value="" disabled>Select a period</option>{periods.map(p => <option value={p.value} key={p.value}>{p.label}</option>)}</select></label><button type="button" disabled={busy} onClick={() => { setNotice(""); setRevision(v => v + 1); }}>Refresh academics</button></div>
    {error && <p className="bw-school-feedback bw-school-error" role="alert">{error.message}</p>}{notice && <p className="bw-school-feedback" role="status">{notice}</p>}
    {activeTab === "setup" && <div className="bw-school-setup-grid">
      <section className="bw-school-card"><span className="bw-school-step">01 / SUBJECTS</span><SchoolForm title="Subjects & courses" description="Set the percentage needed to pass each subject." busy={busy} action="Add subject" fields={[{ name: "name", label: "Subject name", maxLength: 120 }, { name: "passingMark", label: "Passing mark (%)", type: "number", min: 0, max: 100, step: "any", value: 50 }]} onSubmit={f => configure("subjects", f, f => ({ name: f.get("name"), passingMark: Number(f.get("passingMark")) }))} /><ul className="bw-school-items">{data.subjects.map(s => <li key={s.id}><strong>{s.name}</strong><span>Pass {s.passingMark}%</span></li>)}</ul></section>
      <section className="bw-school-card"><span className="bw-school-step">02 / CLASSES & SECTIONS</span><SchoolForm title="Class levels" busy={busy} action="Add class" fields={[{ name: "name", label: "Class level", maxLength: 100, placeholder: "e.g. Grade 10" }]} onSubmit={f => configure("classes", f)} />
        <SchoolForm title="Class sections" busy={busy || !data.classes.length} action="Add section" fields={[{ name: "classId", label: "Class", options: data.classes.map(c => option(c.id, c.name)) }, { name: "name", label: "Section name", maxLength: 60, placeholder: "e.g. A" }, { name: "capacity", label: "Capacity", type: "number", min: 1, max: 500, value: 40 }]} onSubmit={f => configure("sections", f, f => ({ ...values(f), capacity: Number(f.get("capacity")) }))} />
        <ul className="bw-school-items">{data.classes.map(c => <li key={c.id}><strong>{c.name}</strong><span>{c.sections.map(s => `${s.name} (${s.capacity} seats)`).join(" · ") || "Add a section"}</span></li>)}</ul></section>
      <section className="bw-school-card"><span className="bw-school-step">03 / ACADEMIC CALENDAR</span><SchoolForm title="Academic years" description="Years must last more than four months. Previous years remain available." busy={busy} action="Add academic year" fields={[{ name: "name", label: "Year name", maxLength: 100, placeholder: "e.g. 2026–2027" }, { name: "startsOn", label: "Year start", type: "date" }, { name: "endsOn", label: "Year end", type: "date" }]} onSubmit={f => configure("years", f)} />
        <SchoolForm title="Terms & semesters" busy={busy || !data.years.length} action="Add academic period" fields={[{ name: "yearId", label: "Academic year", options: data.years.map(y => option(y.id, y.name)) }, { name: "name", label: "Period name", maxLength: 100 }, { name: "kind", label: "Period type", options: [option("TERM", "Term"), option("SEMESTER", "Semester")] }, { name: "startsOn", label: "Period start", type: "date" }, { name: "endsOn", label: "Period end", type: "date" }]} onSubmit={f => configure("periods", f)} />
        <ul className="bw-school-items">{data.years.map(y => <li key={y.id}><strong>{y.name}</strong><span>{y.periods.map(p => p.name).join(" · ") || "Add a period"}</span></li>)}</ul></section>
      <section className="bw-school-card"><span className="bw-school-step">04 / PERIOD SUBJECTS</span><SchoolForm key={periodId} title="Subject offerings" description="Offer subjects to a section for the selected period. Assign teachers in Teaching & attendance." busy={busy || !periodId} action="Offer subject" fields={[{ name: "sectionId", label: "Section", options: sections }, { name: "subjectId", label: "Subject", options: data.subjects.map(s => option(s.id, s.name)) }, { name: "mode", label: "Subject requirement", options: [option("COMPULSORY", "Compulsory"), option("ELECTIVE", "Elective")] }]} onSubmit={f => configure("offerings", f, f => ({ ...values(f), periodId }))} />
        <ul className="bw-school-items">{data.offerings.map(o => <li key={o.id}><strong>{o.subject.name}</strong><span>{o.section.schoolClass.name} / {o.section.name} · {o.mode.toLowerCase()}</span></li>)}</ul>{!periodId && <p className="bw-school-help">Create an academic year and period to begin.</p>}</section>
    </div>}
    {activeTab === "students" && <SchoolStudents key={campusId + ":" + periodId} campusId={campusId} data={data} sections={sections} busy={busy} run={run} revision={revision} />}
    {activeTab === "teaching" && <SchoolTeaching key={campusId + ":" + periodId} campusId={campusId} data={data} busy={busy} run={run} revision={revision} />}
  </section>;
}
