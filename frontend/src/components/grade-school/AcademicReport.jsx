import { useMemo, useState } from "react";
import "./campus-dashboard.css";

const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const date = value => value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
const time = value => Number.isFinite(value) ? String(Math.floor(value / 60)).padStart(2, "0") + ":" + String(value % 60).padStart(2, "0") : "—";
const TABS = [["overview", "Overview"], ["schedule", "Timetable"], ["attendance", "Attendance"], ["assessments", "Assessments"], ["grades", "Grades"], ["announcements", "Announcements"]];
const human = value => String(value || "").replaceAll("_", " ").toLowerCase().replace(/^./, char => char.toUpperCase());

function Empty({ title, description }) {
  return <div className="bw-campus-dash-empty"><strong>{title}</strong><p>{description}</p></div>;
}
function Stat({ label, value, note }) {
  return <div className="bw-campus-dash-stat"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

export default function AcademicReport({ data, onClose }) {
  const [tab, setTab] = useState("overview");
  const r = data.registration;
  const subjects = data.subjects || [];
  const announcements = data.announcements || [];
  const { schedules, attendance, assessments, average, present, total } = useMemo(() => {
    const timetable = subjects.flatMap(row => (row.offering?.schedules || []).map(s => ({ ...s, subject: row.offering.subject.name, teacher: row.offering.teacher?.fullName }))).sort((a, b) => a.weekday - b.weekday || a.startsAt - b.startsAt);
    const records = subjects.flatMap(row => (row.attendance || []).map(a => ({ ...a, subject: row.offering.subject.name }))).sort((a, b) => String(b.heldOn).localeCompare(String(a.heldOn)));
    const results = subjects.flatMap(row => (row.assessments || []).map(a => ({ ...a, subject: row.offering.subject.name }))).sort((a, b) => String(b.heldOn).localeCompare(String(a.heldOn)));
    const scores = subjects.map(s => s.grade?.percent).filter(Number.isFinite);
    return { schedules: timetable, attendance: records, assessments: results, average: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null, present: records.filter(a => ["PRESENT", "LATE"].includes(a.status)).length, total: records.length };
  }, [subjects]);
  const student = r.student?.account?.fullName || "Student";
  return <section className="bw-school-report bw-campus-dashboard" aria-label="Student academic report">
    <header className="bw-campus-dash-header"><div><p className="bw-campus-dash-eyebrow">BRIGHTWAY / MY CAMPUS / GRADE SCHOOL</p><h3>{data.schoolName || "My school"}</h3><p>{student} <span aria-hidden="true">·</span> {r.section.schoolClass.name} / {r.section.name}</p><div className="bw-campus-dash-term">{r.period.year.name} <span> / </span> {r.period.name}</div></div>
      <div className="bw-campus-dash-actions">{onClose && <button type="button" onClick={onClose}>Back to campuses</button>}<button type="button" className="bw-school-primary" onClick={() => window.print()}>Print academic report</button></div>
    </header>
    <div className="bw-campus-dash-stats">
      <Stat label="Subjects" value={subjects.length} note="This academic period" />
      <Stat label="Reported average" value={average === null ? "—" : average + "%"} note="Finalized scores only" />
      <Stat label="Attendance" value={total ? Math.round(100 * present / total) + "%" : "—"} note={total ? present + " present or late / " + total + " finalized" : "No final records"} />
      <Stat label="Assessments" value={assessments.length} note="Published results" />
    </div>
    <nav className="bw-campus-dash-tabs" aria-label="Student Campus sections">{TABS.map(([key, label]) => <button type="button" key={key} aria-label={label} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}{key === "announcements" && announcements.length > 0 ? <span className="bw-campus-dash-count">{announcements.length}</span> : null}</button>)}</nav>
    <div className="bw-campus-dash-content">
      <div hidden={tab !== "overview"} className="bw-campus-dash-overview">
        <section className="bw-campus-dash-panel"><h4>My subjects</h4><p className="bw-campus-dash-description">Class and teacher assignments for this academic period.</p>
          {subjects.length ? <div className="bw-campus-dash-list">{subjects.map(row => <div className="bw-campus-dash-subject" key={row.offering.id}><div className="bw-campus-dash-subject-icon" aria-hidden="true">{row.offering.subject.name.slice(0, 1).toUpperCase()}</div><div><strong>{row.offering.subject.name}</strong><small>{row.offering.teacher?.fullName || "Teacher not yet assigned"}</small></div><span>{human(row.offering.mode || "Subject")}</span></div>)}</div> : <Empty title="No subjects yet" description="Subjects appear once the school has published its academic offerings." />}
        </section>
        <aside className="bw-campus-dash-panel"><h4>Timetable at a glance</h4><p className="bw-campus-dash-description">Your scheduled subject sessions.</p>
          {schedules.length ? <div className="bw-campus-dash-list">{schedules.slice(0, 5).map(s => <div className="bw-campus-dash-compact" key={s.id}><span>{DAYS[s.weekday] || "Day"} · {time(s.startsAt)}</span><strong>{s.subject}</strong><small>{s.room || "Room not specified"}</small></div>)}</div> : <Empty title="No schedule published" description="Your school has not published a timetable for this period." />}
          {schedules.length > 5 && <button type="button" onClick={() => setTab("schedule")}>View full timetable</button>}
          {announcements.length > 0 && <div className="bw-campus-dash-notice"><strong>Latest announcement</strong><p>{announcements[0].title}</p><button type="button" onClick={() => setTab("announcements")}>Read updates</button></div>}
        </aside>
      </div>
      <section hidden={tab !== "schedule"} className="bw-campus-dash-panel"><h4>My timetable</h4><p className="bw-campus-dash-description">Scheduled subjects and rooms. Times follow your institution's timetable.</p>
        {schedules.length ? <div className="bw-campus-dash-table-wrap"><table><thead><tr><th scope="col">Day</th><th scope="col">Time</th><th scope="col">Subject</th><th scope="col">Teacher</th><th scope="col">Room</th></tr></thead><tbody>{schedules.map(s => <tr key={s.id}><td>{DAYS[s.weekday]}</td><td>{time(s.startsAt)}–{time(s.endsAt)}</td><th scope="row">{s.subject}</th><td>{s.teacher || "Not assigned"}</td><td>{s.room || "—"}</td></tr>)}</tbody></table></div> : <Empty title="No timetable published" description="The school will publish subject sessions when scheduling is complete." />}
      </section>
      <section hidden={tab !== "attendance"} className="bw-campus-dash-panel"><h4>Final attendance</h4><p className="bw-campus-dash-description">Only attendance submitted as final by your teachers is shown.</p>
        {attendance.length ? <div className="bw-campus-dash-table-wrap"><table><thead><tr><th>Date</th><th>Subject</th><th>Status</th></tr></thead><tbody>{attendance.map((a, i) => <tr key={a.id || a.subject + ":" + a.heldOn + ":" + i}><td>{date(a.heldOn)}</td><th scope="row">{a.subject}</th><td><span className="bw-campus-dash-state">{human(a.status)}</span></td></tr>)}</tbody></table></div> : <Empty title="No finalized attendance" description="Draft attendance is not visible to students." />}
      </section>
      <section hidden={tab !== "assessments"} className="bw-campus-dash-panel"><h4>Published assessments</h4><p className="bw-campus-dash-description">Only finalized assessment results are included.</p>
        {assessments.length ? <div className="bw-campus-dash-table-wrap"><table><thead><tr><th>Assessment</th><th>Subject</th><th>Date</th><th>Score</th><th>Weight</th></tr></thead><tbody>{assessments.map(a => <tr key={a.id}><th scope="row">{a.title}</th><td>{a.subject}</td><td>{date(a.heldOn)}</td><td>{a.score ?? "—"} / {a.maxScore}</td><td>{a.weight}</td></tr>)}</tbody></table></div> : <Empty title="No published assessments" description="Your school will release results after assessments are finalized." />}
      </section>
      <section hidden={tab !== "grades"} className="bw-campus-dash-panel"><h4>Subject grades</h4><p className="bw-campus-dash-description">Averages reflect finalized assessments published so far, not necessarily final term grades.</p>
        {subjects.length ? <div className="bw-campus-dash-table-wrap"><table><thead><tr><th>Subject</th><th>Average</th><th>Pass mark</th><th>Outcome</th></tr></thead><tbody>{subjects.map(row => <tr key={row.offering.id}><th scope="row">{row.offering.subject.name}</th><td>{row.grade?.percent == null ? "—" : row.grade.percent + "% average"}</td><td>{row.grade?.passingMark ?? row.offering.subject.passingMark}%</td><td>{human(row.grade?.outcome || "Not yet graded")}</td></tr>)}</tbody></table></div> : <Empty title="No grades available" description="Your school has not published subject results yet." />}
      </section>
      <section hidden={tab !== "announcements"} className="bw-campus-dash-panel"><h4>Campus announcements</h4><p className="bw-campus-dash-description">Official messages from your institution.</p>
        {announcements.length ? <div className="bw-campus-dash-list">{announcements.map(a => <article key={a.id} className="bw-campus-dash-announcement"><strong>{a.title}</strong><time dateTime={a.createdAt}>{date(a.createdAt)}</time><p>{a.body}</p></article>)}</div> : <Empty title="No announcements" description="Institution-wide updates will appear here when published." />}
      </section>
    </div>
  </section>;
}
