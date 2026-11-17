import { countries } from "../learning/countries";
import { useId } from "react";

const JOB_CATEGORIES = ["Technology", "Education", "Healthcare", "Finance", "Agriculture", "Engineering", "Administration", "Research", "Marketing", "Hospitality", "Other"];
const JOB_LEVELS = ["NO_EXPERIENCE", "ENTRY", "JUNIOR", "MID", "SENIOR", "MANAGER", "EXECUTIVE"];
const EDUCATION = ["NOT_SPECIFIED", "NO_FORMAL_EDUCATION", "HIGH_SCHOOL", "CERTIFICATE", "DIPLOMA", "ASSOCIATE", "BACHELORS", "MASTERS", "DOCTORATE"];
const STUDY_LEVELS = ["HIGH_SCHOOL", "TVET", "CERTIFICATE", "DIPLOMA", "UNDERGRADUATE", "MASTERS", "PHD", "POSTDOCTORAL"];
const FUNDING = ["FULLY_FUNDED", "PARTIALLY_FUNDED", "FIXED_AMOUNT", "TUITION_WAIVER", "STIPEND", "OTHER"];
const labelFor = value => value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, character => character.toUpperCase());
const textList = value => (value || []).join("\n");

function Choice({ label, value, values, update, required = false, multi = false }) {
  if (multi) return <fieldset className="bw-op-detail-options"><legend>{label}</legend>
    <div className="bw-op-detail-choices">{values.map(v => <label key={v} className="bw-op-checkbox">
      <input type="checkbox" checked={(value || []).includes(v)} onChange={e => update(e.target.checked ? [...(value || []), v] : (value || []).filter(item => item !== v))} />{labelFor(v)}
    </label>)}</div>
  </fieldset>;
  return <label>{label}<select required={required} value={value || ""} onChange={e => update(e.target.value)}>
    <option value="">Select {label.toLowerCase()}</option>{values.map(v => <option key={v} value={v}>{labelFor(v)}</option>)}
  </select></label>;
}
function Entry({ label, value, update, type = "text", required = false, min, max, placeholder, options, listId }) {
  return <label>{label}<input type={type} value={value ?? ""} required={required} min={min} max={max}
    list={options?.length ? listId : undefined} placeholder={placeholder || ""} onChange={e => update(type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : ["date", "month"].includes(type) ? (e.target.value || undefined) : e.target.value)} />{options?.length ? <datalist id={listId}>{options.map(item => <option key={item} value={item}/>)}</datalist> : null}</label>;
}
function Many({ label, value, update, hint }) {
  return <label>{label}<textarea rows={3} value={textList(value)}
    placeholder={hint || "Enter one item per line"} onChange={e => update(e.target.value.split("\n"))} /></label>;
}
function Toggle({ label, value, update }) {
  return <label className="bw-op-checkbox"><input type="checkbox" checked={Boolean(value)} onChange={e => update(e.target.checked)} />{label}</label>;
}
function Section({ title, children }) {
  return <section className="bw-op-challenge-section bw-op-details-section"><h4>{title}</h4>{children}</section>;
}

export default function DedicatedOpportunityFields({ type, details, onChange, section = "all", locked = false }) {
  const headingId = useId();
  const data = details || {};
  const set = (key, value) => { if (!locked) onChange({ ...data, [key]: value }); };
  const val = key => data[key];
  const input = (label, key, opts = {}) => <Entry label={label} value={val(key)} update={v => set(key, v)} {...opts} />;
  const select = (label, key, values, required = false) => <Choice label={label} value={val(key)} values={values} required={required} update={v => set(key, v)} />;
  const multiple = (label, key, values) => <Choice label={label} value={val(key)} values={values} multi update={v => set(key, v)} />;
  const many = (label, key, hint) => <Many label={label} value={val(key)} update={v => set(key, v)} hint={hint} />;
  const toggle = (label, key) => <Toggle label={label} value={val(key)} update={v => set(key, v)} />;
  if (type === "JOB") return <div aria-labelledby={headingId} className="bw-op-dedicated-details">
    <h3 id={headingId}>Job vacancy details</h3>
    {(section === "all" || section === 1) && <Section title="1. Job information">
      <div className="bw-op-field-row">{select("Job category", "category", JOB_CATEGORIES)}{select("Experience level", "experienceLevel", JOB_LEVELS)}</div>
      <div className="bw-op-field-row">{input("Number of vacancies", "vacancies", { type: "number", min: 1 })}{input("Expected start date", "startDate", { type: "date" })}</div>
    </Section>}
    {(section === "all" || section === 2) && <Section title="2. Location and benefits">
      <div className="bw-op-field-row">{input("Country", "country", { options: countries.map(row => row.name), listId: headingId + "-country" })}{input("County / State", "region")}</div>
      <div className="bw-op-field-row">{input("City", "city")}{input("Work address (optional)", "address")}</div>
      {many("Additional benefits", "benefits", "Health insurance\nTransport allowance\nTraining")}
    </Section>}
    {(section === "all" || section === 3) && <Section title="3. Requirements and qualifications">
      <div className="bw-op-field-row">{select("Minimum education", "education", EDUCATION)}{input("Minimum experience (months)", "experienceMonths", { type: "number", min: 0 })}</div>
      {many("Preferred fields of study", "fieldsOfStudy")}
      {many("Required skills", "requiredSkills")}
      {many("Preferred skills", "preferredSkills")}
      {many("Certifications or licenses", "certifications")}
      {many("Languages", "languages")}
      {many("Job responsibilities", "responsibilities")}
      {many("Required qualifications", "requiredQualifications")}
      {many("Preferred qualifications", "preferredQualifications")}
    </Section>}
    {(section === "all" || section === 4) && <Section title="4. Applicant documents">
      <div className="bw-op-detail-choices">{toggle("Require CV / résumé", "requireCv")}{toggle("Require cover letter", "requireCoverLetter")}{toggle("Require portfolio", "requirePortfolio")}</div>
      {many("Other required documents", "additionalDocuments")}
      {input("Application limit (optional)", "applicationLimit", { type: "number", min: 1 })}
    </Section>}
    {(section === "all" || section === 5) && <Section title="5. Recruitment and selection">
      {multiple("Recruitment stages", "recruitmentStages", ["APPLICATION_REVIEW", "SHORTLISTING", "ASSESSMENT", "INTERVIEW", "FINAL_SELECTION"])}
      {input("Expected hiring date", "hiringDate", { type: "date" })}
      <p className="bw-op-challenge-cover-help">Reviewers and their permissions are managed within the organization's authorized recruitment workspace.</p>
    </Section>}
  </div>;
  if (type !== "SCHOLARSHIP") return null;
  return <div aria-labelledby={headingId} className="bw-op-dedicated-details">
    <h3 id={headingId}>Scholarship details</h3>
    {(section === "all" || section === 1) && <Section title="1. Scholarship information">
      {select("Scholarship category", "category", ["MERIT", "NEED", "RESEARCH", "ATHLETIC", "GOVERNMENT", "INSTITUTIONAL", "PROFESSIONAL_DEVELOPMENT", "OTHER"])}
      {multiple("Academic levels", "academicLevels", STUDY_LEVELS)}
      {many("Eligible fields of study", "fieldsOfStudy")}
      {input("Number of scholarships", "awardsAvailable", { type: "number", min: 1 })}
    </Section>}
    {(section === "all" || section === 2) && <Section title="2. Funding and benefits">
      <div className="bw-op-field-row">{select("Funding type", "fundingType", FUNDING, true)}{select("Currency", "currency", ["USD", "LRD", "EUR", "GBP"])}</div>
      {["FIXED_AMOUNT", "STIPEND", "PARTIALLY_FUNDED"].includes(val("fundingType")) && input("Scholarship value", "value", { type: "number", min: 0 })}
      <div className="bw-op-field-row">{input("Funding duration (months)", "fundingMonths", { type: "number", min: 1 })}
        {["FULLY_FUNDED", "PARTIALLY_FUNDED", "TUITION_WAIVER"].includes(val("fundingType")) && input("Tuition coverage (%)", "tuitionPercent", { type: "number", min: 0, max: 100 })}</div>
      <div className="bw-op-detail-choices">
        {toggle("Living allowance", "livingAllowance")}{toggle("Accommodation", "accommodation")}
        {toggle("Travel support", "travelSupport")}{toggle("Health insurance", "healthInsurance")}
        {toggle("Books and learning materials", "learningMaterials")}
      </div>
      {val("livingAllowance") && input("Living allowance amount", "livingAllowanceAmount", { type: "number", min: 0 })}
      {many("Other benefits", "benefits")}
    </Section>}
    {(section === "all" || section === 3) && <Section title="3. Study destination and institution">
      <div className="bw-op-field-row">{input("Study country", "studyCountry", { options: countries.map(row => row.name), listId: headingId + "-study-country" })}{input("City or region", "studyRegion")}</div>
      {input("Host institution", "institution", { placeholder: "Institution name" })}
      {many("Programs or courses", "programs")}
      <div className="bw-op-field-row">{input("Program duration (months)", "programMonths", { type: "number", min: 1 })}
        {input("Academic intake (YYYY-MM)", "intake", { type: "month" })}</div>
    </Section>}
    {(section === "all" || section === 4) && <Section title="4. Eligibility requirements">
      {many("Eligible countries", "eligibleCountries", "Enter one country per line, or Worldwide")}
      {select("Minimum education", "education", EDUCATION)}
      <div className="bw-op-field-row">{input("Minimum age (if applicable)", "minAge", { type: "number", min: 0 })}
        {input("Maximum age (if applicable)", "maxAge", { type: "number", min: 0 })}</div>
      {input("Minimum GPA or grade (if applicable)", "academicPerformance")}
      {toggle("Work experience required", "workExperienceRequired")}
      {val("workExperienceRequired") && input("Required work experience (months)", "experienceMonths", { type: "number", min: 0 })}
      {many("Language requirements", "languages")}
      {toggle("Financial need evidence required", "financialNeedRequired")}
      {many("Additional eligibility criteria", "eligibilityCriteria")}
    </Section>}
    {(section === "all" || section === 5) && <Section title="5. Application and selection">
      <div className="bw-op-field-row">{input("Application opening date", "openingDate", { type: "date" })}
        {input("Expected announcement date", "announcementDate", { type: "date" })}</div>
      <div className="bw-op-detail-choices">
        {toggle("Academic transcript required", "requireTranscript")}
        {toggle("Personal statement required", "requireStatement")}
        {toggle("Recommendation letter required", "requireRecommendation")}
        {toggle("Research proposal required", "requireResearchProposal")}
        {toggle("CV / résumé required", "requireCv")}
        {toggle("Proof of admission required", "requireAdmission")}
      </div>
      {many("Other required documents", "additionalDocuments")}
      {many("Selection criteria", "selectionCriteria")}
      {multiple("Selection stages", "selectionStages", ["APPLICATION_REVIEW", "SHORTLISTING", "ASSESSMENT", "INTERVIEW", "FINAL_SELECTION"])}
    </Section>}
  </div>;
}
