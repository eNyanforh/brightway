const STUDY_LEVELS = ["HIGH_SCHOOL", "TVET", "CERTIFICATE", "DIPLOMA", "UNDERGRADUATE", "MASTERS", "PHD", "POSTDOCTORAL"];
const FUNDING = ["FULLY_FUNDED", "PARTIALLY_FUNDED", "FIXED_AMOUNT", "TUITION_WAIVER", "STIPEND", "OTHER"];
const STAGES = ["APPLICATION_REVIEW", "SHORTLISTING", "ASSESSMENT", "INTERVIEW", "FINAL_SELECTION"];
const CATEGORIES = ["MERIT", "NEED", "RESEARCH", "ATHLETIC", "GOVERNMENT", "INSTITUTIONAL", "PROFESSIONAL_DEVELOPMENT", "OTHER"];
const EDUCATION = ["NOT_SPECIFIED", "NO_FORMAL_EDUCATION", "HIGH_SCHOOL", "CERTIFICATE", "DIPLOMA", "ASSOCIATE", "BACHELORS", "MASTERS", "DOCTORATE"];
const title = value => value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());
const lines = value => Array.isArray(value) ? value.join("\n") : "";
const Section = ({ title: heading, hint, children }) => <section className="bw-op-challenge-section bw-scholarship-section">
  <h4>{heading}</h4>{hint && <p className="bw-scholarship-hint">{hint}</p>}{children}
</section>;

export default function ScholarshipCreationFields({ step, details = {}, onChange, locked = false }) {
  const set = (key, value) => { if (!locked) onChange({ ...details, [key]: value }); };
  const text = (label, key, props = {}) => <label>{label}<input type="text" maxLength={props.maxLength || 300} value={details[key] ?? ""} placeholder={props.placeholder || ""}
    onChange={e => set(key, e.target.value)} /></label>;
  const number = (label, key, min = 0, max) => <label>{label}<input type="number" min={min} max={max} step={["value", "livingAllowanceAmount"].includes(key) ? "0.01" : "1"}
    value={details[key] ?? ""} onChange={e => set(key, e.target.value === "" ? null : Number(e.target.value))}/></label>;
  const date = (label, key) => <label>{label}<input type="date" value={details[key] || ""}
    onChange={e => set(key, e.target.value || "")}/></label>;
  const select = (label, key, items) => <label>{label}<select value={details[key] || ""} onChange={e => set(key, e.target.value)}>
    <option value="">Select an option</option>{items.map(item => <option key={item} value={item}>{title(item)}</option>)}
  </select></label>;
  const multiline = (label, key, hint) => <label>{label}<textarea rows={3} value={lines(details[key])}
    placeholder={hint || "One item per line"} onChange={e => set(key, e.target.value.split("\n"))}/></label>;
  const toggle = (label, key) => <label className="bw-op-checkbox"><input type="checkbox" checked={Boolean(details[key])}
    onChange={e => set(key, e.target.checked)}/>{label}</label>;
  const multi = (label, key, values) => <fieldset className="bw-op-detail-options"><legend>{label}</legend>
    <div className="bw-op-detail-choices">{values.map(item => <label key={item} className="bw-op-checkbox"><input type="checkbox"
      checked={(details[key] || []).includes(item)} onChange={e => set(key, e.target.checked
        ? [...(details[key] || []), item] : (details[key] || []).filter(value => value !== item))}/>{title(item)}</label>)}</div>
  </fieldset>;
  const priority = (label, key) => <label className="bw-scholarship-priority">{label} priority
    <select value={details.eligibilityPriority?.[key] || "REQUIRED"} onChange={e => set("eligibilityPriority",
      { ...(details.eligibilityPriority || {}), [key]: e.target.value })}>
      <option value="REQUIRED">Hard requirement</option><option value="PREFERRED">Preferred</option>
    </select>
  </label>;
  const rubric = details.scoringRubric || [];
  const updateRubric = (id, values) => set("scoringRubric", rubric.map(row => row.id === id ? { ...row, ...values } : row));

  if (step === 1) return <>
    <Section title="Scholarship overview" hint="Make your scholarship easy to recognize in BrightWay search and discovery.">
      <label>Short summary <span className="bw-scholarship-count">{(details.shortSummary || "").length}/160</span>
        <textarea rows={2} maxLength={160} value={details.shortSummary || ""} placeholder="Describe the award in one or two sentences."
          onChange={e => set("shortSummary", e.target.value)}/>
      </label>
      <div className="bw-op-field-row">{select("Scholarship category", "category", CATEGORIES)}
        {text("Target field or discipline (optional)", "targetDiscipline", { placeholder: "Economics, Nursing, or general" })}</div>
      {multi("Academic levels", "academicLevels", STUDY_LEVELS)}
      {multiline("Eligible fields of study (optional)", "fieldsOfStudy")}
    </Section>
  </>;

  if (step === 2) return <>
    <Section title="Award structure" hint="A full-tuition award does not require an estimated cash value. Fixed-amount awards do.">
      <div className="bw-op-field-row">{select("Funding type", "fundingType", FUNDING)}
        {select("Currency", "currency", ["USD", "LRD", "EUR", "GBP"])}</div>
      <div className="bw-op-field-row">
        {["FIXED_AMOUNT", "STIPEND", "PARTIALLY_FUNDED"].includes(details.fundingType) && number("Scholarship value", "value", 0)}
        {number("Number of scholarships", "awardsAvailable", 1)}
      </div>
      <div className="bw-op-field-row">{select("Award duration", "awardDuration", ["ONE_TIME", "SEMESTER", "RENEWABLE"])}
        {number("Funding duration (months)", "fundingMonths", 1)}</div>
      {details.awardDuration === "RENEWABLE" && text("Renewal conditions", "renewalConditions",
        { placeholder: "For example: maintain a GPA of 3.0" })}
      {["FULLY_FUNDED", "PARTIALLY_FUNDED", "TUITION_WAIVER"].includes(details.fundingType) &&
        number("Tuition coverage (%)", "tuitionPercent", 0, 100)}
    </Section>
    <Section title="What the scholarship covers">
      <div className="bw-op-detail-choices">{toggle("Living allowance", "livingAllowance")}
        {toggle("Accommodation / housing", "accommodation")}{toggle("Travel / transport support", "travelSupport")}
        {toggle("Health insurance", "healthInsurance")}{toggle("Books and learning materials", "learningMaterials")}</div>
      {details.livingAllowance && number("Living allowance amount", "livingAllowanceAmount", 0)}
      {multiline("Other benefits (optional)", "benefits")}
    </Section>
  </>;

  if (step === 3) return <>
    <Section title="Eligibility" hint="Mark criteria as required or preferred. Preferred criteria should never automatically block an application.">
      {multiline("Eligible countries", "eligibleCountries", "Liberia\\nGhana or Worldwide")}
      {priority("Country", "eligibleCountries")}
      <div className="bw-op-field-row">{number("Minimum age (optional)", "minAge", 0, 120)}
        {number("Maximum age (optional)", "maxAge", 0, 120)}</div>
      {priority("Age", "age")}
      <div className="bw-op-field-row">{select("Minimum education", "education", EDUCATION)}
        {text("Minimum GPA or grade (optional)", "academicPerformance")}</div>
      {priority("Academic achievement", "academicPerformance")}
      {select("Targeted applicant group (optional)", "targetGender", ["ALL", "WOMEN", "MEN", "OTHER"])}
      {toggle("Financial need evidence required", "financialNeedRequired")}
      {priority("Financial need", "financialNeedRequired")}
      {toggle("Work experience required", "workExperienceRequired")}
      {details.workExperienceRequired && number("Required work experience (months)", "experienceMonths", 0)}
      {multiline("Language requirements (optional)", "languages")}
      {multiline("Additional eligibility criteria", "eligibilityCriteria")}
    </Section>
    <Section title="Study location and programs" hint="Preserved from BrightWay's existing scholarship fields.">
      <div className="bw-op-field-row">{text("Study country", "studyCountry")}
        {text("City or region", "studyRegion")}</div>
      {text("Host institution", "institution")}
      {multiline("Programs or courses", "programs")}
      <div className="bw-op-field-row">{number("Program duration (months)", "programMonths", 1)}
        <label>Academic intake <input type="month" value={details.intake || ""} onChange={e => set("intake", e.target.value)} /></label></div>
    </Section>
  </>;

  if (step === 4) return <>
    <Section title="Required applicant documents" hint="Documents selected here automatically become private upload questions in the BrightWay application form.">
      <div className="bw-op-detail-choices">
        {toggle("Academic transcript required", "requireTranscript")}
        {toggle("Personal statement required", "requireStatement")}
        {toggle("Recommendation letter required", "requireRecommendation")}
        {toggle("Research proposal required", "requireResearchProposal")}
        {toggle("CV / résumé required", "requireCv")}
        {toggle("Proof of admission required", "requireAdmission")}
      </div>
      {multiline("Other required documents", "additionalDocuments")}
    </Section>
  </>;

  if (step === 5) return <>
    <Section title="Application timeline" hint="Use the deadline picker below to set the actual application closing time.">
      <div className="bw-op-field-row">{date("Application opening date", "openingDate")}
        {date("Review begins", "reviewStartDate")}</div>
      <div className="bw-op-field-row">{date("Review ends", "reviewEndDate")}
        {date("Interview date (optional)", "interviewDate")}</div>
      {date("Expected announcement date", "announcementDate")}
      <label>Application deadline timezone
        <select value={details.deadlineTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"}
          onChange={e => set("deadlineTimezone", e.target.value)}>
          {[...new Set([details.deadlineTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", "UTC", ...(Intl.supportedValuesOf?.("timeZone") || [])])].map(zone =>
            <option value={zone} key={zone}>{zone}</option>)}
        </select>
      </label>
      <p className="bw-scholarship-hint">The selected timezone controls the exact closing instant, including daylight saving time.</p>
      {number("Maximum applications (optional)", "applicationLimit", 1)}
    </Section>
  </>;

  if (step === 6) return <>
    <Section title="How applications will be reviewed">
      {select("Review method", "selectionMethod", ["SINGLE_REVIEWER", "COMMITTEE", "SCORING_RUBRIC"])}
      {multiline("Selection criteria", "selectionCriteria", "Academic achievement\\nFinancial need")}
      {multi("Selection stages", "selectionStages", STAGES)}
      <p className="bw-scholarship-hint">Reviewer invitations and access are managed by authorized organization administrators in BrightWay. This form does not send email invitations.</p>
    </Section>
    {details.selectionMethod === "SCORING_RUBRIC" && <Section title="Scoring rubric" hint="Weights must add up to exactly 100% before publishing.">
      {rubric.map((row, index) => <div className="bw-scholarship-rubric-row" key={row.id}>
        <label>Criterion {index + 1}<input value={row.label} maxLength={120} onChange={e => updateRubric(row.id, { label: e.target.value })}/></label>
        <label>Weight (%)<input type="number" min="0" max="100" step="1" value={row.weight}
          onChange={e => updateRubric(row.id, { weight: Number(e.target.value) })}/></label>
        <button type="button" className="bw-op-text-button" onClick={() => set("scoringRubric", rubric.filter(entry => entry.id !== row.id))}>
          Remove
        </button>
      </div>)}
      <p className="bw-scholarship-hint">Total: {rubric.reduce((sum, row) => sum + (Number(row.weight) || 0), 0)}%</p>
      <button type="button" className="bw-op-secondary" disabled={rubric.length >= 10}
        onClick={() => set("scoringRubric", [...rubric, { id: crypto.randomUUID(), label: "", weight: 0 }])}>+ Add scoring criterion</button>
    </Section>}
  </>;
  return null;
}
