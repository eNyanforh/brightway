import "./campus-workspace-stats.css";

/**
 * Only summarize the already authorized, server-scoped Campus setup response.
 * Never request institution-wide counts through a learner or teacher endpoint.
 */
export default function CampusWorkspaceStats({ engine, data }) {
  const manager = Boolean(data.canManage);
  const metrics = engine === "TVET"
    ? manager
      ? [
          ["Programs / trades", data.programs?.length || 0, "Institution training"],
          ["Intakes / cohorts", data.intakes?.length || 0, "Program enrolment cycles"],
          ["Training sections", (data.intakes || []).reduce((total, intake) => total + (intake.sections?.length || 0), 0), "Groups across intakes"],
          ["Instructor assignments", data.assignments?.length || 0, "Scoped training roles"],
        ]
      : [["Assigned training scopes", data.assignments?.length || 0, "Your authorized assignments"]]
    : manager
      ? [
          ["Academic years", data.years?.length || 0, "Historical years retained"],
          ["Academic periods", (data.years || []).reduce((total, year) => total + (year.periods?.length || 0), 0), "Terms and semesters"],
          ["Class sections", (data.classes || []).reduce((total, classroom) => total + (classroom.sections?.length || 0), 0), "Defined class groups"],
          ["Subjects", data.subjects?.length || 0, "Configured subjects"],
        ]
      : [["Assigned subjects", data.offerings?.length || 0, "Your authorized offerings"]];
  const hint = engine === "TVET"
    ? data.intakes?.length ? "Choose an intake to manage training operations." : "Start with a program and intake before enrolling learners."
    : data.years?.some(y => y.periods?.length) ? "Choose a period to manage registration, teaching and assessment." : "Begin with subjects, classes and an academic calendar.";
  return <section className="bw-campus-workspace-summary" aria-label={engine === "TVET" ? "TVET workspace summary" : "Grade School workspace summary"}>
    <div className="bw-campus-workspace-summary-top"><strong>Campus at a glance</strong><span>{manager ? "Administration" : engine === "TVET" ? "Instructor view" : "Teacher view"}</span></div>
    <div className="bw-campus-workspace-metrics">{metrics.map(([label, count, detail]) => <div key={label}><span>{label}</span><strong>{count}</strong><small>{detail}</small></div>)}</div>
    {manager && <p className="bw-campus-workspace-hint">{hint}</p>}
  </section>;
}
