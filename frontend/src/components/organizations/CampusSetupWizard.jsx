import { useEffect, useRef, useState } from "react";
import { campusApi } from "../../api/campus";
import { schoolApi } from "../../api/grade-school";
import { tvetApi } from "../../api/tvet";
import "./campus-setup-wizard.css";

const names = { GRADE_SCHOOL: "Grade School", TVET: "Technical & Vocational Education (TVET)" };
const flows = {
  GRADE_SCHOOL: [
    ["subjects", "Subjects & courses"],
    ["classes", "Classes & sections"],
    ["calendar", "Academic year & periods"],
    ["teachers", "Subject offerings & teachers"],
  ],
  TVET: [
    ["programs", "Programs & trades"],
    ["intakes", "Intakes & cohorts"],
    ["sections", "Sections & optional modules"],
    ["instructors", "Instructor assignments"],
  ],
};
const message = error => error?.message || "Campus setup could not be saved. Check your connection and retry.";
const asMoney = value => Math.round(Number(value) * 100);
const options = items => items.map(item => <option key={item.id} value={item.id}>{item.name}</option>);
const sectionsFor = data => (data.classes || []).flatMap(group => group.sections.map(section => ({
  ...section, name: group.name + " / " + section.name,
})));
const periodsFor = data => (data.years || []).flatMap(year => year.periods.map(period => ({
  ...period, name: year.name + " / " + period.name,
})));

function Section({ title, description, children }) {
  return <section className="bw-campus-wizard-stage"><h3>{title}</h3><p>{description}</p>{children}</section>;
}
function Entries({ items, empty, describe }) {
  return <div className="bw-campus-wizard-entries" aria-live="polite">
    {items.length ? <ul>{items.map(item => <li key={item.id}><strong>{item.name}</strong><span>{describe?.(item)}</span></li>)}</ul> : <p>{empty}</p>}
  </div>;
}
function Form({ name, action, busy, disabled, children, onSave }) {
  return <form aria-label={name} className="bw-campus-wizard-form" onSubmit={async event => {
    event.preventDefault();
    await onSave(new FormData(event.currentTarget));
  }}>{children}<button type="submit" disabled={busy || disabled}>{busy ? "Saving…" : action}</button></form>;
}
function Control({ title, name, children, ...props }) {
  const { type = "text", ...rest } = props;
  return <label>{title}{children || <input type={type} name={name} required {...rest} />}</label>;
}
function Choice({ title, name, items, placeholder, ...rest }) {
  return <Control title={title}><select name={name} required {...rest}>
    <option value="">{placeholder || "Choose " + title.toLowerCase()}</option>{options(items)}
  </select></Control>;
}

export default function CampusSetupWizard({ organization, snapshot, onRefresh, onDismiss, onFinish }) {
  const campus = snapshot.campus, engine = campus?.engine || snapshot.eligibility.supportedEngines[0] || "GRADE_SCHOOL";
  const [identity, setIdentity] = useState({
    engine, displayName: campus?.displayName || organization.name, contactEmail: campus?.contactEmail || "",
  });
  const [stage, setStage] = useState(!campus ? "identity" : campus.storedStatus === "SETUP" ? "activation" : flows[engine][0][0]);
  const [academic, setAcademic] = useState(null);
  const [periodId, setPeriodId] = useState("");
  const [intakeId, setIntakeId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const lock = useRef(false), dialogRef = useRef(null), previousFocus = useRef(null);
  const id = organization.id;
  const active = campus?.status === "ACTIVE";
  const flow = flows[engine] || flows.GRADE_SCHOOL;
  const phaseIndex = flow.findIndex(([key]) => key === stage);
  const academicReady = Boolean(active && academic);

  // Keep focus inside the modal and restore it when dismissed.
  useEffect(() => {
    previousFocus.current = document.activeElement;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = dialogRef.current;
    dialog?.focus();
    const onKeyDown = event => {
      if (event.key === "Escape") { event.preventDefault(); if (!lock.current) onDismiss(); }
      if (event.key !== "Tab" || !dialog) return;
      const controls = [...dialog.querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]")];
      if (!controls.length) { event.preventDefault(); return; }
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = before; previousFocus.current?.focus?.(); };
  }, [onDismiss]);

  useEffect(() => {
    if (!active) { setAcademic(null); return; }
    const controller = new AbortController();
    const api = engine === "TVET" ? tvetApi : schoolApi;
    const selected = engine === "TVET" ? intakeId : periodId;
    api.setup(id, selected || undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) { setAcademic(result); setError(""); } })
      .catch(cause => { if (!controller.signal.aborted) { setAcademic(null); setError(message(cause)); } });
    return () => controller.abort();
  }, [id, engine, active, periodId, intakeId, revision]);

  async function execute(action, success, nextStage) {
    if (lock.current) return false;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const result = await action();
      if (success) setNotice(success);
      if (nextStage) setStage(nextStage);
      setRevision(value => value + 1);
      return result;
    } catch (cause) { setError(message(cause)); return false; }
    finally { lock.current = false; setBusy(false); }
  }
  async function saveIdentity(event) {
    event.preventDefault();
    await execute(async () => {
      await campusApi.setup(id, {
        engine: identity.engine, displayName: identity.displayName.trim(),
        contactEmail: identity.contactEmail.trim() || null, expectedVersion: campus?.version || 0,
      });
      await onRefresh();
    }, "Campus details saved. Activation is a separate, explicit action.", "activation");
  }
  async function activate() {
    await execute(async () => {
      await campusApi.activate(id, campus.version);
      await onRefresh();
    }, "Campus activated. You can now configure its academic records.", flows[engine][0][0]);
  }
  function next() { setError(""); setNotice(""); setStage(flow[phaseIndex + 1][0]); }
  function back() { setError(""); setNotice(""); setStage(flow[phaseIndex - 1][0]); }
  const school = engine === "GRADE_SCHOOL" && academicReady ? academic : null;
  const tvet = engine === "TVET" && academicReady ? academic : null;
  const subjects = school?.subjects || [], classes = school?.classes || [], schoolSections = school ? sectionsFor(school) : [];
  const years = school?.years || [], periods = school ? periodsFor(school) : [];
  const selectedPeriod = school?.periodId || "";
  const schoolOfferings = school?.offerings || [];
  const programs = tvet?.programs || [], intakes = tvet?.intakes || [];
  const selectedIntake = intakes.find(item => item.id === tvet?.intakeId);
  const program = programs.find(item => item.id === selectedIntake?.programId);
  const assignments = tvet?.assignments || [];
  const progress = stage === "identity" ? 0 : stage === "activation" ? 1 : phaseIndex + 2;
  const total = flow.length + 2;
  const canAdvance = engine === "GRADE_SCHOOL"
    ? stage === "subjects" ? subjects.length > 0
      : stage === "classes" ? schoolSections.length > 0
      : stage === "calendar" ? periods.length > 0 : false
    : stage === "programs" ? programs.length > 0
      : stage === "intakes" ? intakes.length > 0
      : stage === "sections" ? intakes.some(item => item.sections.length > 0) : false;
  const canFinish = engine === "GRADE_SCHOOL"
    ? schoolOfferings.length > 0 && schoolOfferings.every(item => Boolean(item.teacherId))
    : assignments.length > 0;

  return <div className="bw-campus-wizard-overlay">
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="bw-campus-wizard-title"
      aria-describedby="bw-campus-wizard-description" tabIndex={-1} className="bw-campus-wizard-dialog">
      <header className="bw-campus-wizard-header">
        <div><span>BRIGHTWAY / VIRTUAL CAMPUS SETUP</span><h2 id="bw-campus-wizard-title">Set up your {engine === "TVET" ? "training Campus" : "school Campus"}</h2>
          <p id="bw-campus-wizard-description">Configure {organization.name} with the academic structure agreed for your institution.</p></div>
        <button type="button" className="bw-campus-wizard-exit" onClick={onDismiss} disabled={busy} aria-label="Close Campus setup">×</button>
      </header>
      <div className="bw-campus-wizard-progress" aria-label="Campus setup progress">
        <span>Step {progress + 1} of {total}</span><div><span style={{ width: ((progress + 1) / total * 100) + "%" }} /></div>
      </div>
      <main className="bw-campus-wizard-body">
        {stage === "identity" && <Section title="Campus details" description="Choose an eligible academic engine and confirm the institution's Campus identity. This does not register learners or create charges.">
          <form className="bw-campus-wizard-form" aria-label="Campus details" onSubmit={saveIdentity}>
            <Control title="Academic engine"><select value={identity.engine} disabled={busy} onChange={event => setIdentity(value => ({ ...value, engine: event.target.value }))}>
              {snapshot.eligibility.supportedEngines.map(value => <option key={value} value={value}>{names[value]}</option>)}
            </select></Control>
            <Control title="Campus display name" name="displayName" maxLength={160} value={identity.displayName} disabled={busy}
              onChange={event => setIdentity(value => ({ ...value, displayName: event.target.value }))} />
            <Control title="Contact email (optional)" name="contactEmail" type="email" required={false} maxLength={254} value={identity.contactEmail} disabled={busy}
              onChange={event => setIdentity(value => ({ ...value, contactEmail: event.target.value }))} />
            <button type="submit" disabled={busy || !identity.displayName.trim() || !snapshot.eligible}>{busy ? "Saving…" : "Save Campus setup"}</button>
          </form>
        </Section>}
        {stage === "activation" && <Section title="Activate your Campus" description="Campus activation enables authorized academic and Campus services. The academic setup follows immediately; it does not create student registrations, billing charges or certificates.">
          <div className="bw-campus-wizard-summary"><strong>{campus?.displayName || identity.displayName}</strong><span>{names[campus?.engine || identity.engine]}</span>
            <span>{snapshot.eligibility.verifiedLiberiaOperation ? "Verified Liberia operation" : "Eligibility restricted"}</span></div>
          <div className="bw-campus-wizard-buttons"><button type="button" disabled={busy} onClick={() => setStage("identity")}>Edit details</button>
            <button type="button" className="primary" disabled={busy || !snapshot.eligible} onClick={activate}>{busy ? "Activating…" : "Activate Campus"}</button></div>
        </Section>}
        {active && !academic && <p role="status">Loading your institution's academic setup…</p>}
        {school && stage === "subjects" && <Section title="1. Subjects & courses" description="Add the subjects taught at the school. Set the passing mark for each subject.">
          <Form name="Add a subject" action="Add subject" busy={busy} onSave={values => execute(() => schoolApi.configure(id, "subjects", { name: values.get("name").trim(), passingMark: Number(values.get("passingMark")) }), "Subject saved.")}>
            <Control title="Subject name" name="name" maxLength={120} placeholder="Mathematics" />
            <Control title="Passing mark (%)" name="passingMark" type="number" min={0} max={100} step="any" defaultValue={50} />
          </Form>
          <Entries items={subjects} empty="No subjects added." describe={item => "Passing mark: " + item.passingMark + "%"} />
        </Section>}
        {school && stage === "classes" && <Section title="2. Classes & sections" description="Create class levels, then add sections and their capacity. Choose the subjects to offer for each section when you configure the academic period.">
          <Form name="Add a class level" action="Add class" busy={busy} onSave={values => execute(() => schoolApi.configure(id, "classes", { name: values.get("name").trim() }), "Class level added.")}>
            <Control title="Class level" name="name" placeholder="Grade 10" maxLength={100} />
          </Form>
          <Form name="Add a class section" action="Add section" busy={busy} disabled={!classes.length} onSave={values => execute(() => schoolApi.configure(id, "sections", { classId: values.get("classId"), name: values.get("name").trim(), capacity: Number(values.get("capacity")) }), "Section added.")}>
            <Choice title="Class level" name="classId" items={classes} />
            <Control title="Section name" name="name" placeholder="A" maxLength={60} />
            <Control title="Capacity" name="capacity" type="number" min={1} max={500} defaultValue={40} />
          </Form>
          <Entries items={schoolSections} empty="Add a class and at least one section." describe={item => item.capacity + " student seats"} />
        </Section>}
        {school && stage === "calendar" && <Section title="3. Academic year & periods" description="Academic years must exceed four months. Add a term or semester within the year before offering subjects. Previous years remain preserved.">
          <Form name="Add an academic year" action="Add academic year" busy={busy} onSave={values => execute(() => schoolApi.configure(id, "years", {
            name: values.get("name").trim(), startsOn: values.get("startsOn"), endsOn: values.get("endsOn"),
          }), "Academic year saved.")}>
            <Control title="Academic year" name="name" placeholder="2026–2027" maxLength={100} />
            <Control title="Start date" name="startsOn" type="date" />
            <Control title="End date" name="endsOn" type="date" />
          </Form>
          <Form name="Add an academic period" action="Add term or semester" busy={busy} disabled={!years.length} onSave={values => execute(() => schoolApi.configure(id, "periods", {
            yearId: values.get("yearId"), name: values.get("name").trim(), kind: values.get("kind"),
            startsOn: values.get("startsOn"), endsOn: values.get("endsOn"),
          }), "Academic period saved.")}>
            <Choice title="Academic year" name="yearId" items={years} />
            <Control title="Period name" name="name" placeholder="Semester 1" maxLength={100} />
            <Control title="Period type"><select name="kind" required defaultValue="SEMESTER"><option value="SEMESTER">Semester</option><option value="TERM">Term</option></select></Control>
            <Control title="Period start" name="startsOn" type="date" />
            <Control title="Period end" name="endsOn" type="date" />
          </Form>
          <Entries items={periods} empty="Create at least one academic year and term/semester." />
        </Section>}
        {school && stage === "teachers" && <Section title="4. Subject offerings & teacher assignment" description="Choose a period, section, and subject, then assign an approved staff member by BrightWay username. Only one teacher can hold the same period, section and subject assignment.">
          <Control title="Academic period"><select aria-label="Academic period for setup" value={selectedPeriod} onChange={event => setPeriodId(event.target.value)}>
            {options(periods)}</select></Control>
          <Form name="Offer a subject" action="Offer subject" busy={busy} disabled={!selectedPeriod || !subjects.length || !schoolSections.length} onSave={values => execute(() => schoolApi.configure(id, "offerings", {
            periodId: selectedPeriod, sectionId: values.get("sectionId"), subjectId: values.get("subjectId"), mode: values.get("mode"),
          }), "Subject offered for the selected period and section.")}>
            <Choice title="Class / section" name="sectionId" items={schoolSections} />
            <Choice title="Subject" name="subjectId" items={subjects} />
            <Control title="Requirement"><select name="mode" defaultValue="COMPULSORY"><option value="COMPULSORY">Compulsory</option><option value="ELECTIVE">Elective</option></select></Control>
          </Form>
          <Form name="Assign a teacher" action="Assign teacher" busy={busy} disabled={!schoolOfferings.length} onSave={values => {
            const row = schoolOfferings.find(item => item.id === values.get("offeringId"));
            return execute(() => schoolApi.assign(id, row.id, { expectedVersion: row.version, username: values.get("username").trim().toLowerCase() }), "Teacher assignment saved.");
          }}>
            <Control title="Subject offering"><select name="offeringId" required><option value="">Choose subject offering</option>
              {schoolOfferings.map(item => <option key={item.id} value={item.id}>{item.section.schoolClass.name} / {item.section.name} · {item.subject.name}{item.teacher ? " · " + item.teacher.username : ""}</option>)}
            </select></Control>
            <Control title="Teacher's BrightWay username" name="username" maxLength={30} placeholder="teacher_username" pattern="[A-Za-z0-9_]{3,30}" />
          </Form>
          <Entries items={schoolOfferings.map(item => ({ ...item, name: item.section.schoolClass.name + " / " + item.section.name + " · " + item.subject.name }))} empty="Offer a subject before assigning teachers." describe={item => item.teacher ? "Teacher: @" + item.teacher.username : "Teacher not yet assigned"} />
        </Section>}
        {tvet && stage === "programs" && <Section title="1. Programs & trades" description="Create practical training programs. Institution-owned tuition is separate from BrightWay's US$1 platform registration fee.">
          <Form name="Add a training program" action="Add program" busy={busy} onSave={values => execute(() => tvetApi.configure(id, "programs", {
            name: values.get("name").trim(), feeMinor: asMoney(values.get("fee")), currency: values.get("currency"), discoverProgramId: null,
          }), "Training program saved.")}>
            <Control title="Program / trade" name="name" maxLength={160} placeholder="Automotive Mechanics" />
            <Control title="Institution program fee" name="fee" type="number" step=".01" min={0} max={1000000} defaultValue={0} />
            <Control title="Currency"><select name="currency" required defaultValue="LRD"><option value="LRD">LRD</option><option value="USD">USD</option></select></Control>
          </Form>
          <Entries items={programs} empty="No programs created." describe={item => (item.feeMinor / 100).toFixed(2) + " " + item.currency} />
        </Section>}
        {tvet && stage === "intakes" && <Section title="2. Intakes & cohorts" description="Set the dates and attendance requirement for each program intake or cohort.">
          <Form name="Add an intake" action="Add intake" busy={busy} disabled={!programs.length} onSave={values => execute(() => tvetApi.configure(id, "intakes", {
            programId: values.get("programId"), name: values.get("name").trim(),
            startsOn: values.get("startsOn"), endsOn: values.get("endsOn"), minimumAttendance: Number(values.get("minimumAttendance")),
          }), "Intake created.")}>
            <Choice title="Training program" name="programId" items={programs} />
            <Control title="Intake name" name="name" placeholder="January 2027 Cohort" maxLength={120} />
            <Control title="Start date" name="startsOn" type="date" /><Control title="End date" name="endsOn" type="date" />
            <Control title="Minimum attendance (%)" name="minimumAttendance" type="number" step="any" min={0} max={100} defaultValue={0} />
          </Form>
          <Entries items={intakes} empty="Create an intake or cohort." describe={item => item.program.name} />
        </Section>}
        {tvet && stage === "sections" && <Section title="3. Sections & optional modules" description="Create training groups and optional modules. TVET is never forced into Grade School class levels, semesters or promotion rules.">
          <Control title="Training intake"><select aria-label="Training intake for setup" value={tvet.intakeId || ""} onChange={event => setIntakeId(event.target.value)}>{options(intakes)}</select></Control>
          <Form name="Add a training section" action="Add training section" busy={busy} disabled={!selectedIntake || Boolean(selectedIntake.startedAt)} onSave={values => execute(() => tvetApi.configure(id, "sections", {
            intakeId: selectedIntake.id, name: values.get("name").trim(), capacity: Number(values.get("capacity")),
          }), "Training section added.")}>
            <Control title="Section name" name="name" placeholder="Workshop A" maxLength={80} />
            <Control title="Learner capacity" name="capacity" type="number" min={1} max={500} defaultValue={40} />
          </Form>
          <Form name="Add an optional or required module" action="Add module" busy={busy} disabled={!selectedIntake || Boolean(selectedIntake.startedAt)} onSave={values => execute(() => tvetApi.configure(id, "modules", {
            programId: selectedIntake.programId, name: values.get("name").trim(), required: values.get("required") === "true",
          }), "Program module saved.")}>
            <Control title="Module name" name="name" placeholder="Engine Systems" maxLength={120} />
            <Control title="Module requirement"><select name="required" defaultValue="true"><option value="true">Required</option><option value="false">Optional</option></select></Control>
          </Form>
          <Entries items={selectedIntake?.sections || []} empty="Add at least one training section." describe={item => item.capacity + " learner seats"} />
          <p className="bw-campus-wizard-hint">{program?.modules?.length || 0} modules for the selected program. Modules are optional.</p>
        </Section>}
        {tvet && stage === "instructors" && <Section title="4. Instructor assignments" description="Assign approved BrightWay staff by program, intake, section or module. The training intake is started later after all required assessments are configured.">
          <Control title="Training intake"><select aria-label="Training intake for instructors" value={tvet.intakeId || ""} onChange={event => setIntakeId(event.target.value)}>{options(intakes)}</select></Control>
          <Form name="Assign a TVET instructor" action="Assign instructor" busy={busy} disabled={!selectedIntake || !selectedIntake.sections?.length || Boolean(selectedIntake.startedAt)} onSave={values => execute(() => tvetApi.assign(id, {
            intakeId: selectedIntake.id, sectionId: values.get("sectionId") || null, moduleId: values.get("moduleId") || null,
            username: values.get("username").trim().toLowerCase(),
          }), "Instructor assignment saved.")}>
            <Control title="Training section"><select name="sectionId"><option value="">All intake sections</option>{options(selectedIntake?.sections || [])}</select></Control>
            <Control title="Training module"><select name="moduleId"><option value="">Entire program (no module)</option>{options(program?.modules || [])}</select></Control>
            <Control title="Instructor's BrightWay username" name="username" maxLength={30} placeholder="instructor_username" pattern="[A-Za-z0-9_]{3,30}" />
          </Form>
          <Entries items={assignments.map(item => ({ ...item, name: (item.section?.name || "All sections") + " / " + (item.module?.name || "Program training") }))} empty="Assign at least one authorized instructor." describe={item => item.instructor?.fullName || "Instructor pending"} />
        </Section>}
        {error && <p className="bw-campus-wizard-error" role="alert">{error}</p>}
        {notice && <p className="bw-campus-wizard-notice" role="status">{notice}</p>}
      </main>
      <footer className="bw-campus-wizard-footer">
        <button type="button" className="quiet" disabled={busy} onClick={onDismiss}>Finish later</button>
        {phaseIndex >= 0 && <div className="bw-campus-wizard-buttons">
          {phaseIndex > 0 && <button type="button" disabled={busy} onClick={back}>Back</button>}
          {phaseIndex < flow.length - 1 && <button type="button" className="primary" disabled={!canAdvance || busy || !academicReady} onClick={next}>Next step</button>}
          {phaseIndex === flow.length - 1 && <button type="button" className="primary" disabled={!canFinish || busy || !academicReady}
            onClick={() => onFinish(engine)}>Finish Campus setup</button>}
        </div>}
      </footer>
    </div>
  </div>;
}
