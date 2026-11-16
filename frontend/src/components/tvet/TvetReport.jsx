import { useMemo, useState } from "react";
import { dateLabel, timeLabel, outcomeLabel } from "./tvet-format";
import "../grade-school/campus-dashboard.css";

const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TABS = [["overview", "Overview"], ["schedule", "Training schedule"], ["attendance", "Attendance"], ["assessments", "Competencies"], ["certificate", "Certificate"], ["announcements", "Announcements"]];
const human = value => String(value || "").replaceAll("_", " ").toLowerCase().replace(/^./, x => x.toUpperCase());
const Empty = ({ title, description }) => <div className="bw-campus-dash-empty"><strong>{title}</strong><p>{description}</p></div>;
const Stat = ({ label, value, note }) => <div className="bw-campus-dash-stat"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;

export default function TvetReport({ data, onClose }) {
  const [tab, setTab] = useState("overview");
  const e = data.enrolment, progress = data.progress, certificate = e.certificate;
  const assessments = progress.assessments || [], attendance = data.attendance || [];
  const announcements = data.announcements || [];
  const schedule = useMemo(() => (data.assignments || []).flatMap(assignment => (assignment.schedules || []).map(entry => ({
    ...entry, topic: assignment.module?.name || "Program training", teacher: assignment.instructor?.fullName || "Instructor not assigned", section: assignment.section?.name || "All sections"
  }))).sort((a, b) => a.weekday - b.weekday || a.startsAt - b.startsAt), [data.assignments]);
  const competent = assessments.filter(a => a.attempts?.some(result => result.outcome === "COMPETENT")).length;
  const completed = e.status === "COMPLETED";
  return <section className="bw-school-report bw-campus-dashboard bw-tvet-dashboard" aria-label="TVET learner record">
    <header className="bw-campus-dash-header"><div><p className="bw-campus-dash-eyebrow">BRIGHTWAY / MY CAMPUS / TVET</p><h3>{data.schoolName}</h3><p>{e.learner.account.fullName} <span aria-hidden="true">·</span> {e.intake.program.name}</p><div className="bw-campus-dash-term">{e.intake.name} <span>/</span> {e.section.name}</div></div><div className="bw-campus-dash-actions">{onClose && <button type="button" onClick={onClose}>Back to campuses</button>}<button type="button" className="bw-school-primary" onClick={() => window.print()}>Print learner record</button></div></header>
    <div className="bw-campus-dash-stats">
      <Stat label="Training status" value={human(e.status)} note={completed ? "Program completed" : "Current enrolment"} />
      <Stat label="Final attendance" value={progress.attendancePercent == null ? "—" : progress.attendancePercent + "%"} note={"Minimum " + progress.minimumAttendance + "% required"} />
      <Stat label="Competencies" value={competent + " / " + assessments.length} note="Competent final outcomes" />
      <Stat label="Certificate" value={certificate ? (certificate.revokedAt ? "Revoked" : "Issued") : "Not issued"} note="Institution-issued credential" />
    </div>
    <nav className="bw-campus-dash-tabs" aria-label="TVET Campus sections">{TABS.map(([key, label]) => <button type="button" key={key} aria-label={label} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}{key === "announcements" && announcements.length > 0 && <span className="bw-campus-dash-count">{announcements.length}</span>}</button>)}</nav>
    <div className="bw-campus-dash-content">
      <div hidden={tab !== "overview"} className="bw-campus-dash-overview"><section className="bw-campus-dash-panel"><h4>My training progress</h4><p className="bw-campus-dash-description">{e.intake.program.name} · {dateLabel(e.intake.startsOn)} – {dateLabel(e.intake.endsOn)}</p>
        <div className={"bw-campus-dash-progress " + (progress.eligible ? "is-complete" : "is-pending")}><strong>{progress.eligible ? "Requirements met" : "Requirements to complete"}</strong><p>{progress.eligible ? "All configured completion requirements are satisfied. The institution controls formal completion and certificate issuance." : "Your institution will confirm completion after all attendance and assessment requirements are met."}</p></div>
        {!progress.eligible && (progress.blockers || []).length > 0 && <ul className="bw-campus-dash-blockers">{progress.blockers.map((blocker, index) => <li key={index}>{blocker}</li>)}</ul>}
        <div className="bw-campus-dash-list">{assessments.map(a => <div className="bw-campus-dash-subject" key={a.id}><div className="bw-campus-dash-subject-icon" aria-hidden="true">{a.kind === "COMPETENCY" || a.kind === "PRACTICAL" ? "P" : "A"}</div><div><strong>{a.title}</strong><small>{a.assignment?.module?.name || "Program assessment"}</small></div><span>{a.required ? "Required" : "Optional"}</span></div>)}</div>
        {!assessments.length && <Empty title="No assessments published" description="Your instructor will add training assessments when ready." />}
      </section><aside className="bw-campus-dash-panel"><h4>Training at a glance</h4><p className="bw-campus-dash-description">Instructor-led, in-person sessions.</p>
        {schedule.length ? <div className="bw-campus-dash-list">{schedule.slice(0, 5).map(s => <div key={s.id} className="bw-campus-dash-compact"><span>{DAYS[s.weekday]} · {timeLabel(s.startsAt)}</span><strong>{s.topic}</strong><small>{s.room || "Room not specified"}</small></div>)}</div> : <Empty title="No sessions scheduled" description="The institution has not published training sessions." />}
        {schedule.length > 5 && <button type="button" onClick={() => setTab("schedule")}>Full schedule</button>}
        {certificate && <div className="bw-campus-dash-notice"><strong>{certificate.revokedAt ? "Revoked certificate" : "Certificate issued"}</strong><p>{certificate.title}</p><button type="button" onClick={() => setTab("certificate")}>View certificate details</button></div>}
      </aside></div>
      <section hidden={tab !== "schedule"} className="bw-campus-dash-panel"><h4>Training timetable</h4><p className="bw-campus-dash-description">In-person training sessions for your program and intake.</p>
        {schedule.length ? <div className="bw-campus-dash-table-wrap"><table><thead><tr><th>Day</th><th>Time</th><th>Training</th><th>Instructor</th><th>Location</th></tr></thead><tbody>{schedule.map(s => <tr key={s.id}><td>{DAYS[s.weekday]}</td><td>{timeLabel(s.startsAt)}–{timeLabel(s.endsAt)}</td><th scope="row">{s.topic}</th><td>{s.teacher}</td><td>{s.room || "—"}</td></tr>)}</tbody></table></div> : <Empty title="No training sessions" description="Check again after your institution publishes a schedule." />}
      </section>
      <section hidden={tab !== "attendance"} className="bw-campus-dash-panel"><h4>Final training attendance</h4><p className="bw-campus-dash-description">Draft training attendance is not included.</p>{attendance.length ? <div className="bw-campus-dash-table-wrap"><table><thead><tr><th>Date</th><th>Module / session</th><th>Status</th></tr></thead><tbody>{attendance.map((row, i) => <tr key={row.attendanceId || i}><td>{dateLabel(row.attendance.heldOn)} · {timeLabel(row.attendance.startsAt)}</td><th scope="row">{row.attendance.assignment?.module?.name || "Program training"}</th><td><span className="bw-campus-dash-state">{human(row.status)}</span></td></tr>)}</tbody></table></div> : <Empty title="No final attendance" description="Attendance appears after your instructor finalizes a session." />}</section>
      <section hidden={tab !== "assessments"} className="bw-campus-dash-panel"><h4>Assessments & competencies</h4><p className="bw-campus-dash-description">Final outcomes and any recorded reassessment attempts are retained.</p>
        {assessments.length ? <div className="bw-campus-dash-list">{assessments.map(a => <article className="bw-campus-dash-assessment" key={a.id}><div><strong>{a.title}</strong><small>{a.assignment?.module?.name || "Program assessment"} · {human(a.kind)} · {a.required ? "Required" : "Optional"}</small></div>{!a.attempts?.length ? <p>Not yet assessed</p> : <ul>{a.attempts.map(result => <li key={result.id}><strong>Attempt {result.attempt}: {outcomeLabel(result.outcome)}</strong><span>{dateLabel(result.heldOn)}{result.score != null ? " · " + result.score + " / " + a.maxScore : ""}</span>{result.feedback && <p>{result.feedback}</p>}</li>)}</ul>}</article>)}</div> : <Empty title="No assessments" description="Practical and competency evaluations will appear once finalized." />}
      </section>
      <section hidden={tab !== "certificate"} className="bw-campus-dash-panel"><h4>Certificate & achievement</h4>{certificate ? <div className={"bw-campus-dash-certificate" + (certificate.revokedAt ? " is-revoked" : "")}><p className="bw-campus-dash-eyebrow">{certificate.revokedAt ? "REVOKED CERTIFICATE" : "VERIFIED INSTITUTION RECORD"}</p><h5>{certificate.title}</h5><p>Presented to</p><strong>{certificate.snapshot.learner.fullName}</strong><p>For completing <b>{certificate.snapshot.program}</b></p><p>{certificate.snapshot.institution} · {certificate.snapshot.intake}</p><small>Completed {dateLabel(certificate.snapshot.completedAt)} · Issued {dateLabel(certificate.issuedAt)}</small><code>{certificate.number}</code>{certificate.revokedAt && <p>Revoked {dateLabel(certificate.revokedAt)}: {certificate.revocationReason}</p>}</div> : <Empty title="No certificate issued" description="Completion and certificate issuance are controlled by your training institution." />}</section>
      <section hidden={tab !== "announcements"} className="bw-campus-dash-panel"><h4>Campus announcements</h4>{announcements.length ? <div className="bw-campus-dash-list">{announcements.map(a => <article key={a.id} className="bw-campus-dash-announcement"><strong>{a.title}</strong><p>{a.body}</p></article>)}</div> : <Empty title="No announcements" description="Official institution updates will appear here." />}</section>
    </div>
  </section>;
}
