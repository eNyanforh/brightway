import { useRef } from "react";
const date = value => new Date(value).toLocaleDateString("en-GB");
const days = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const time = value => String(Math.floor(value / 60)).padStart(2, "0") + ":" + String(value % 60).padStart(2, "0");
export default function AcademicReport({ data, onClose }) {
  const r = data.registration, element = useRef(null);
  function print() {
    const details = [...element.current.querySelectorAll("details")], states = details.map(d => d.open);
    details.forEach(d => { d.open = true; });
    window.addEventListener("afterprint", () => details.forEach((d, i) => { d.open = states[i]; }), { once: true });
    window.print();
  }
  return <section ref={element} className="bw-school-report" aria-label="Student academic report"><header><div><p className="bw-school-eyebrow">ACADEMIC REPORT</p>{data.schoolName && <p>{data.schoolName}</p>}<h3>{r.student.account.fullName}</h3><p>{r.period.year.name} · {r.period.name} · {r.section.schoolClass.name} / {r.section.name}</p></div><div className="bw-school-actions">{onClose && <button type="button" onClick={onClose}>Close report</button>}<button type="button" onClick={print}>Print report</button></div></header>
    <p className="bw-school-help">Results include finalized assessments and attendance. Weighted averages use the assessments published so far.</p>
    <div className="bw-school-table-wrap"><table><caption>Subject results</caption><thead><tr><th>Subject</th><th>Average</th><th>Passing mark</th><th>Result</th><th>Present / Late</th><th>Absent</th><th>Excused</th></tr></thead><tbody>{data.subjects.map(row => <tr key={row.offering.id}><th scope="row">{row.offering.subject.name}</th><td>{row.grade.percent === null ? "—" : row.grade.percent + "%"}</td><td>{row.grade.passingMark}%</td><td>{row.grade.outcome.replaceAll("_", " ")}</td><td>{row.attendance.filter(a => ["PRESENT", "LATE"].includes(a.status)).length}</td><td>{row.attendance.filter(a => a.status === "ABSENT").length}</td><td>{row.attendance.filter(a => a.status === "EXCUSED").length}</td></tr>)}</tbody></table></div>
    {!data.subjects.length && <p>No subjects have been offered to this registration yet.</p>}
    {data.subjects.map(row => <details key={row.offering.id} className="bw-school-detail"><summary>{row.offering.subject.name} · Assessments, attendance & timetable</summary><p>Teacher: {row.offering.teacher?.fullName || "Awaiting assignment"}</p>
      <ul>{row.offering.schedules.map(s => <li key={s.id}>{days[s.weekday]} {time(s.startsAt)}–{time(s.endsAt)}{s.room && " · " + s.room}</li>)}</ul>
      <div className="bw-school-table-wrap"><table><caption>Final assessments</caption><thead><tr><th>Assessment</th><th>Date</th><th>Score</th><th>Weight</th></tr></thead><tbody>{row.assessments.map(a => <tr key={a.id}><th scope="row">{a.title}</th><td>{date(a.heldOn)}</td><td>{a.score} / {a.maxScore}</td><td>{a.weight}</td></tr>)}</tbody></table></div>
      <div className="bw-school-table-wrap"><table><caption>Final attendance</caption><thead><tr><th>Date</th><th>Status</th></tr></thead><tbody>{row.attendance.map(a => <tr key={a.id || a.heldOn + ":" + (a.startsAt || 0)}><td>{date(a.heldOn)} · {time(a.startsAt || 0)}</td><td>{a.status}</td></tr>)}</tbody></table></div>
    </details>)}
    {data.announcements?.length > 0 && <section><h3>Campus announcements</h3>{data.announcements.map(a => <article className="bw-school-detail" key={a.id}><h4>{a.title}</h4><p className="bw-school-prewrap">{a.body}</p><small>{date(a.createdAt)}</small></article>)}</section>}
  </section>;
}
