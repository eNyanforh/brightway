import { useEffect, useMemo, useState } from "react";
import { JOB_TYPES, JOB_COMPENSATION_TYPES, JOB_SALARY_PERIODS, formatJobSalary } from "../../../../shared/opportunities.mjs";
import { opportunitiesApi as api } from "../../api/opportunities";
import { staffApi } from "../../api/organization-staff";
import NavigationIcon from "../layout/NavigationIcon";
import OpportunityDateTimePicker from "./OpportunityDateTimePicker";
import OpportunityDescriptionField from "./OpportunityDescriptionField";

const EDUCATION = ["No Formal Education", "High School", "Certificate", "Diploma", "Associate Degree", "Bachelor's", "Master's", "Doctorate", "Not Specified"];
const MODES = { IN_PERSON: "In person", REMOTE: "Remote / Online", HYBRID: "Hybrid" };
const LEVELS = { NO_EXPERIENCE: "No experience required", ENTRY: "Entry level", JUNIOR: "Junior", MID: "Mid-level", SENIOR: "Senior", MANAGER: "Manager", EXECUTIVE: "Executive" };
const CURRENCIES = { USD: "US$", LRD: "L$", EUR: "€", GBP: "£" };
const FUNDING = { FULL: "Fully funded", PARTIAL: "Partially funded", FIXED: "Fixed amount", TUITION_WAIVER: "Tuition waiver", STIPEND: "Stipend", OTHER: "Other" };
const COVERAGES = { NONE: "Not specified", "100": "100%", "75": "75%", "50": "50%", "25": "25%", CUSTOM: "Custom percentage" };
const JOB_CATEGORIES = ["Information Technology", "Education", "Healthcare", "Administration", "Finance", "Engineering", "Agriculture", "Research", "Marketing", "Customer Service", "Operations", "Design", "Construction", "Other"];
const SCHOLARSHIP_CATEGORIES = ["Merit-Based", "Need-Based", "Research", "Athletic", "Government", "Institutional", "Professional Development", "Other"];
const ACADEMIC_LEVELS = ["High School", "TVET", "Certificate", "Diploma", "Undergraduate", "Master's", "PhD", "Postdoctoral"];
const BENEFITS = ["Health insurance", "Accommodation", "Transportation", "Meals", "Paid leave", "Training", "Professional development"];
const STAGES = ["Application review", "Shortlisting", "Assessment", "Interview", "Final selection"];
const SCH_STAGES = ["Eligibility screening", "Document review", "Academic assessment", "Interview", "Final selection"];
const DOCUMENTS = {
  JOB: [
    ["resume", "CV / Resume"], ["coverLetter", "Cover Letter"],
    ["portfolio", "Portfolio"], ["certifications", "Certification Documents"],
  ],
  SCHOLARSHIP: [
    ["transcript", "Academic Transcript"], ["personalStatement", "Personal Statement"],
    ["recommendation", "Recommendation Letter"], ["researchProposal", "Research Proposal"],
    ["resume", "CV / Resume"], ["admissionProof", "Proof of Admission"],
  ],
};
const regions = (() => {
  try {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    const all = [];
    for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b), name = names.of(code);
      if (name && name !== code && !name.startsWith("Unknown")) all.push(name);
    }
    return [...new Set(all)].sort((a, b) => a.localeCompare(b));
  } catch { return ["Liberia", "Ghana", "Nigeria", "Sierra Leone", "United States", "United Kingdom"]; }
})();

export const blankJobSpecification = () => ({
  category: "", experienceLevel: "", vacancies: null, country: "", region: "", city: "", address: "", benefits: [],
  minimumEducation: "", studyFields: [], experienceMonths: null, requiredSkills: [], preferredSkills: [],
  certifications: [], languages: [], responsibilities: [], requiredQualifications: [], preferredQualifications: [],
  expectedStartDate: "", documentQuestionIds: {}, additionalDocuments: [], applicationLimit: null,
  recruitmentStages: [], expectedHiringDate: "", reviewerIds: [],
});
export const blankScholarshipSpecification = () => ({
  category: "", academicLevels: [], studyFields: [], awards: null,
  fundingType: "", scholarshipValue: null, currency: null, fundingDurationMonths: null,
  tuitionCoverage: "NONE", customTuitionPercent: null, livingAllowance: null, accommodation: false,
  travelSupport: false, healthInsurance: false, booksMaterials: false, otherBenefits: [],
  studyCountry: "", studyRegion: "", hostInstitution: "", programs: [], programDurationMonths: null,
  academicIntake: "", eligibleCountries: [], minimumEducation: "", academicRequirement: "", eligibleStudyFields: [],
  ageMin: null, ageMax: null, workExperienceMonths: null, languages: [], financialNeed: false,
  eligibilityCriteria: [], applicationsOpen: "", documentQuestionIds: {}, additionalDocuments: [],
  selectionCriteria: "", selectionStages: [], announcementDate: "",
});
const F = (key, label, kind = "text", extra = {}) => ({ key, label, kind, ...extra });
const jobFields = [
  [],
  [
    F("title", "Job title", "text", { required: true, placeholder: "e.g. Junior software developer" }),
    F("description", "Job description", "description", { required: true, wide: true }),
    F("spec.category", "Job category", "suggest", { required: true, options: JOB_CATEGORIES }),
    F("jobDetails.type", "Job type", "select", { required: true, options: JOB_TYPES }),
    F("spec.experienceLevel", "Experience level", "select", { required: true, options: LEVELS }),
    F("spec.vacancies", "Number of vacancies", "integer", { min: 1 }),
  ],
  [
    F("workMode", "Work mode", "select", { required: true, options: MODES }),
    F("location", "Location shown on card", "text", { required: true, placeholder: "e.g. Monrovia, Liberia or Worldwide" }),
    F("spec.country", "Country", "country", { when: draft => draft.workMode !== "REMOTE" }),
    F("spec.region", "State / County", "text", { when: draft => draft.workMode !== "REMOTE" }),
    F("spec.city", "City", "text", { when: draft => draft.workMode !== "REMOTE" }),
    F("spec.address", "Work address", "text", { when: draft => draft.workMode !== "REMOTE" }),
    F("jobDetails.compensationType", "Compensation type", "select", { required: true, options: JOB_COMPENSATION_TYPES }),
    F("jobDetails.salaryMin", "Minimum salary", "money", { when: draft => ["PAID", "STIPEND"].includes(draft.jobDetails?.compensationType) }),
    F("jobDetails.salaryMax", "Maximum salary", "money", { when: draft => ["PAID", "STIPEND"].includes(draft.jobDetails?.compensationType) }),
    F("jobDetails.salaryCurrency", "Currency", "select", { options: CURRENCIES, when: draft => ["PAID", "STIPEND"].includes(draft.jobDetails?.compensationType) }),
    F("jobDetails.salaryPeriod", "Payment period", "select", { options: JOB_SALARY_PERIODS, when: draft => ["PAID", "STIPEND"].includes(draft.jobDetails?.compensationType) }),
    F("spec.benefits", "Additional benefits", "multi", { options: BENEFITS, wide: true }),
  ],
  [
    F("spec.minimumEducation", "Minimum education", "select", { options: EDUCATION }),
    F("spec.studyFields", "Preferred fields of study", "tags"),
    F("spec.experienceMonths", "Minimum experience (months)", "integer"),
    F("spec.requiredSkills", "Required skills", "tags"),
    F("spec.preferredSkills", "Preferred skills", "tags"),
    F("spec.certifications", "Certifications / licences", "tags"),
    F("spec.languages", "Languages", "tags"),
    F("spec.responsibilities", "Responsibilities", "tags", { required: true, wide: true, maxLength: 500 }),
    F("spec.requiredQualifications", "Required qualifications", "tags", { required: true, wide: true, maxLength: 500 }),
    F("spec.preferredQualifications", "Preferred qualifications", "tags", { wide: true, maxLength: 500 }),
  ],
  [
    F("deadline", "Application deadline", "deadline", { required: true, wide: true }),
    F("spec.expectedStartDate", "Expected start date", "date"),
    F("spec.applicationLimit", "Application limit", "integer", { min: 1 }),
  ],
  [
    F("spec.recruitmentStages", "Recruitment stages", "multi", { options: STAGES, wide: true }),
    F("spec.expectedHiringDate", "Expected hiring date", "date"),
  ],
  [],
];
const scholarshipFields = [
  [],
  [
    F("title", "Scholarship title", "text", { required: true, placeholder: "e.g. Undergraduate research scholarship" }),
    F("description", "Scholarship description", "description", { required: true, wide: true }),
    F("spec.category", "Scholarship category", "select", { required: true, options: SCHOLARSHIP_CATEGORIES }),
    F("spec.academicLevels", "Academic levels", "multi", { required: true, options: ACADEMIC_LEVELS }),
    F("spec.studyFields", "Fields of study", "tags"),
    F("spec.awards", "Number of scholarships", "integer", { min: 1 }),
  ],
  [
    F("spec.fundingType", "Funding type", "select", { required: true, options: FUNDING }),
    F("spec.scholarshipValue", "Scholarship value", "money", { requiredWhen: draft => draft.scholarshipSpecification?.fundingType === "FIXED" }),
    F("spec.currency", "Currency", "select", { options: CURRENCIES }),
    F("spec.fundingDurationMonths", "Funding duration (months)", "integer", { min: 1 }),
    F("spec.tuitionCoverage", "Tuition coverage", "select", { options: COVERAGES }),
    F("spec.customTuitionPercent", "Custom tuition coverage (%)", "percent", { when: draft => draft.scholarshipSpecification?.tuitionCoverage === "CUSTOM" }),
    F("spec.livingAllowance", "Living allowance amount", "money"),
    F("spec.accommodation", "Accommodation included", "toggle"),
    F("spec.travelSupport", "Travel support included", "toggle"),
    F("spec.healthInsurance", "Health insurance included", "toggle"),
    F("spec.booksMaterials", "Books and materials included", "toggle"),
    F("spec.otherBenefits", "Other benefits", "tags", { wide: true }),
  ],
  [
    F("spec.studyCountry", "Study country", "country"),
    F("spec.studyRegion", "Study region / city", "text"),
    F("spec.hostInstitution", "Host institution", "text", { placeholder: "Institution name (BrightWay lookup can be added)" }),
    F("workMode", "Study mode", "select", { required: true, options: MODES }),
    F("location", "Location shown on card", "text", { required: true, placeholder: "e.g. Liberia, Worldwide or Online" }),
    F("spec.programs", "Programs / courses", "tags", { wide: true }),
    F("spec.programDurationMonths", "Program duration (months)", "integer", { min: 1 }),
    F("spec.academicIntake", "Academic intake (YYYY-MM)", "month"),
  ],
  [
    F("spec.eligibleCountries", "Eligible countries", "multi", { required: true, options: regions, wide: true }),
    F("spec.minimumEducation", "Minimum education", "select", { options: EDUCATION }),
    F("spec.academicRequirement", "Required academic performance / GPA", "text"),
    F("spec.eligibleStudyFields", "Eligible fields of study", "tags"),
    F("spec.ageMin", "Minimum age (if legally justified)", "integer"),
    F("spec.ageMax", "Maximum age (if legally justified)", "integer"),
    F("spec.workExperienceMonths", "Work experience (months)", "integer"),
    F("spec.languages", "Language requirements", "tags"),
    F("spec.financialNeed", "Financial need must be demonstrated", "toggle", { wide: true }),
    F("spec.eligibilityCriteria", "Additional eligibility criteria", "tags", { wide: true, maxLength: 500 }),
  ],
  [
    F("deadline", "Application deadline", "deadline", { required: true, wide: true }),
    F("spec.applicationsOpen", "Application opening date", "date"),
    F("spec.selectionCriteria", "Selection criteria", "textarea", { required: true, wide: true, maxLength: 3000 }),
    F("spec.selectionStages", "Selection process", "multi", { options: SCH_STAGES, wide: true }),
    F("spec.announcementDate", "Expected announcement date", "date"),
  ],
  [],
];

const goodDate = value => value && Number.isFinite(new Date(value).getTime()) && new Date(value).getTime() > Date.now();
export function validateDedicatedStep(draft, step) {
  const job = draft.type === "JOB";
  const sch = draft.type === "SCHOLARSHIP";
  if (!job && !sch) return null;
  const spec = job ? { ...blankJobSpecification(), ...draft.jobSpecification } :
    { ...blankScholarshipSpecification(), ...draft.scholarshipSpecification };
  if (step === 6) {
    for (let i = 1; i <= 5; i++) {
      const error = validateDedicatedStep(draft, i);
      if (error) return error;
    }
    return null;
  }
  if (step === 1 && (draft.title.trim().length < 3 || draft.description.trim().length < 30 || !spec.category.trim()))
    return "Add a title, description (at least 30 characters), and category.";
  if (job) {
    if (step === 1 && (!draft.jobDetails?.type || !spec.experienceLevel)) return "Choose a job type and experience level.";
    if (step === 2) {
      if (draft.location.trim().length < 2 || !draft.jobDetails?.compensationType) return "Provide a location and compensation type.";
      const j = draft.jobDetails;
      const amounts = j.salaryMin !== null && j.salaryMin !== undefined || j.salaryMax !== null && j.salaryMax !== undefined;
      if (amounts && (j.salaryMin === null || j.salaryMin === undefined || j.salaryMax === null || j.salaryMax === undefined ||
        j.salaryMin > j.salaryMax || !j.salaryCurrency || !j.salaryPeriod)) return "Complete the salary range, currency, and period.";
    }
    if (step === 3 && (!spec.responsibilities.length || !spec.requiredQualifications.length))
      return "Add at least one responsibility and one required qualification.";
    if (step === 4 && !goodDate(draft.deadline)) return "Choose a future application deadline.";
  } else {
    if (step === 1 && !spec.academicLevels.length) return "Select at least one academic level.";
    if (step === 2 && (!spec.fundingType || (spec.fundingType === "FIXED" && (spec.scholarshipValue === null || !spec.currency)) ||
       (spec.scholarshipValue !== null && !spec.currency) ||
       (spec.tuitionCoverage === "CUSTOM" && spec.customTuitionPercent === null)))
      return "Complete the funding details and any required amounts.";
    if (step === 3 && draft.location.trim().length < 2) return "Enter the study location shown to applicants.";
    if (step === 4 && (!spec.eligibleCountries.length || (spec.ageMin !== null && spec.ageMax !== null && spec.ageMin > spec.ageMax)))
      return "Select eligible countries and check the age range.";
    if (step === 5 && (!goodDate(draft.deadline) || spec.selectionCriteria.trim().length < 10))
      return "Enter a future application deadline and selection criteria.";
  }
  if (draft.questions.filter(q => q.type === "FILE_UPLOAD").length > 10)
    return "An application can require up to 10 file uploads.";
  return null;
}

function TagEditor({ value = [], onChange, suggestions = [], maxLength = 160 }) {
  const [text, setText] = useState("");
  function add(e) {
    e.preventDefault();
    const item = text.trim();
    if (!item || value.includes(item) || value.length >= 30 || item.length > maxLength) return;
    onChange([...value, item]); setText("");
  }
  return <div className="bw-dedicated-tags">
    <div className="bw-dedicated-chips">{value.map(item => <span key={item}>{item}
      <button type="button" aria-label={"Remove " + item} onClick={() => onChange(value.filter(v => v !== item))}>×</button>
    </span>)}</div>
    <div className="bw-dedicated-tag-entry">
      <input aria-label="Add an item" maxLength={maxLength} value={text} list={suggestions.length ? "dedicated-list-" + maxLength : undefined}
        placeholder="Type and add" onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") add(e); }} />
      <button type="button" onClick={add} disabled={!text.trim() || value.length >= 30}>Add</button>
    </div>
    {suggestions.length > 0 && <datalist id={"dedicated-list-" + maxLength}>{suggestions.map(v => <option value={v} key={v} />)}</datalist>}
  </div>;
}
function MultiPicker({ value = [], options, onChange, label }) {
  const [filter, setFilter] = useState("");
  const all = Array.isArray(options) ? options : Object.entries(options).map(([value, label]) => ({ value, label }));
  const normalized = all.map(item => typeof item === "string" ? { value: item, label: item } : item);
  const shown = normalized.filter(o => o.label.toLowerCase().includes(filter.trim().toLowerCase())).slice(0, 30);
  return <details className="bw-dedicated-multi">
    <summary>{value.length ? value.length + " selected" : "Select " + label.toLowerCase()}</summary>
    <div className="bw-dedicated-multi-panel">
      <input type="search" value={filter} aria-label={"Search " + label.toLowerCase()} placeholder="Search options"
        onChange={e => setFilter(e.target.value)} />
      {shown.map(item => <label className="bw-dedicated-multi-option" key={item.value}>
        <input type="checkbox" checked={value.includes(item.value)}
          onChange={e => onChange(e.target.checked ? [...value, item.value] : value.filter(v => v !== item.value))} />
        {item.label}
      </label>)}
      {shown.length === 0 && <p>No matching options.</p>}
      {value.length > 0 && <div className="bw-dedicated-chips">{value.map(v => <span key={v}>{normalized.find(o => o.value === v)?.label || v}</span>)}</div>}
    </div>
  </details>;
}
function Reviewers({ organizationId, value, onChange }) {
  const [staff, setStaff] = useState([]), [error, setError] = useState("");
  useEffect(() => {
    if (!organizationId) return;
    const controller = new AbortController();
    staffApi.staff(organizationId, controller.signal).then(data => {
      if (!controller.signal.aborted) setStaff((data.members || []).filter(m => m.enabled &&
        (m.permissions || []).includes("organization.applications.review")));
    }).catch(() => { if (!controller.signal.aborted) setError("Reviewer directory is unavailable. You can leave this blank."); });
    return () => controller.abort();
  }, [organizationId]);
  return <div className="bw-dedicated-reviewers">
    <h4>Application reviewers (optional)</h4>
    <p>Only staff who already have the application review permission can be selected.</p>
    {error && <p role="status">{error}</p>}
    {staff.map(member => <label key={member.id}>
      <input type="checkbox" checked={value.includes(member.id)}
        onChange={e => onChange(e.target.checked ? [...value, member.id] : value.filter(id => id !== member.id))} />
      {member.fullName || member.username}
    </label>)}
    {!staff.length && !error && <p>There are no available reviewers in the first staff page.</p>}
  </div>;
}
function DocumentRequirements({ draft, field, specKey }) {
  const spec = draft[specKey] || {}, docMap = spec.documentQuestionIds || {};
  const kind = draft.type, docs = DOCUMENTS[kind];
  function toggle(key, label, checked) {
    const questionId = docMap[key] || crypto.randomUUID();
    const nextMap = { ...docMap }, nextQuestions = draft.questions.filter(q => q.id !== questionId);
    if (checked) {
      if (nextQuestions.filter(q => q.type === "FILE_UPLOAD").length >= 10) return;
      nextMap[key] = questionId;
      nextQuestions.push({ id: questionId, label, type: "FILE_UPLOAD", required: true, options: [] });
    } else delete nextMap[key];
    field(specKey, { ...spec, documentQuestionIds: nextMap });
    field("questions", nextQuestions);
  }
  const [extra, setExtra] = useState("");
  function addExtra() {
    const label = extra.trim();
    const key = "extra:" + label;
    if (!label || label.length > 120 || (spec.additionalDocuments || []).includes(label) ||
      draft.questions.filter(q => q.type === "FILE_UPLOAD").length >= 10) return;
    const id = crypto.randomUUID();
    field(specKey, { ...spec, additionalDocuments: [...(spec.additionalDocuments || []), label],
      documentQuestionIds: { ...docMap, [key]: id } });
    field("questions", [...draft.questions, { id, label, type: "FILE_UPLOAD", required: true, options: [] }]);
    setExtra("");
  }
  return <section className="bw-op-challenge-section bw-dedicated-documents">
    <h4>Application documents</h4>
    <p>Every selected document becomes a secure file-upload question in the BrightWay application.</p>
    <div className="bw-dedicated-doc-grid">{docs.map(([key, label]) => <label key={key} className="bw-dedicated-switch">
      <input type="checkbox" checked={Boolean(docMap[key])}
        disabled={!docMap[key] && draft.questions.filter(q => q.type === "FILE_UPLOAD").length >= 10}
        onChange={e => toggle(key, label, e.target.checked)} /><span>{label} required</span>
    </label>)}</div>
    {(spec.additionalDocuments || []).map(label => <div key={label} className="bw-dedicated-extra">
      <span>{label}</span><button type="button" onClick={() => {
        toggle("extra:" + label, label, false);
        field(specKey, { ...spec, additionalDocuments: spec.additionalDocuments.filter(x => x !== label),
          documentQuestionIds: Object.fromEntries(Object.entries(docMap).filter(([key]) => key !== "extra:" + label)) });
      }}>Remove</button>
    </div>)}
    <div className="bw-dedicated-tag-entry">
      <input aria-label="Additional document name" maxLength={120} placeholder="Add another required document" value={extra}
        onChange={e => setExtra(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addExtra(); } }} />
      <button type="button" disabled={!extra.trim() || (spec.additionalDocuments || []).length >= 10} onClick={addExtra}>Add</button>
    </div>
  </section>;
}
function Field({ config, draft, spec, write }) {
  const { key, label, kind, required, options = [], placeholder, min, maxLength = 160 } = config;
  if (config.when && !config.when(draft)) return null;
  const [root, child] = key.split(".");
  const value = child ? (root === "spec" ? spec[child] : draft[root]?.[child]) : draft[key];
  const val = value ?? "";
  const change = v => write(key, v);
  if (kind === "toggle") return <label className="bw-dedicated-switch">
    <input type="checkbox" checked={Boolean(value)} onChange={e => change(e.target.checked)} /><span>{label}</span>
  </label>;
  return <label className={"bw-dedicated-field" + (config.wide ? " is-wide" : "")}>{label}{required && " *"}
    {kind === "description" ? <OpportunityDescriptionField value={val} onChange={change}
      placeholder="Explain responsibilities, purpose, and important details." /> :
    kind === "deadline" ? <OpportunityDateTimePicker value={val} onChange={change} /> :
    kind === "textarea" ? <textarea required={required} rows={5} maxLength={maxLength} value={val}
      placeholder={placeholder} onChange={e => change(e.target.value)} /> :
    kind === "select" ? <select required={required} value={val} onChange={e => change(e.target.value || (key.endsWith("Currency") || key === "spec.currency" ? null : ""))}>
      <option value="">Select {label.toLowerCase()}</option>
      {(Array.isArray(options) ? options.map(o => [o,o]) : Object.entries(options)).map(([v,name]) =>
        <option key={v} value={v}>{name}</option>)}
    </select> :
    kind === "multi" ? <MultiPicker label={label} value={Array.isArray(value) ? value : []} options={options} onChange={change} /> :
    kind === "tags" ? <TagEditor value={Array.isArray(value) ? value : []} onChange={change} maxLength={maxLength} /> :
    kind === "suggest" || kind === "country" ? <>
      <input required={required} type="text" value={val} placeholder={placeholder || "Search or enter a value"}
        maxLength={maxLength} list={kind === "country" ? "bw-dedicated-countries" : "bw-dedicated-categories"}
        onChange={e => change(e.target.value)} />
      <datalist id={kind === "country" ? "bw-dedicated-countries" : "bw-dedicated-categories"}>
        {(kind === "country" ? regions : options).map(item => <option key={item} value={item} />)}
      </datalist>
    </> :
    <input type={kind === "integer" || kind === "money" || kind === "percent" ? "number" :
      kind === "date" ? "date" : kind === "month" ? "month" : "text"}
      required={required || Boolean(config.requiredWhen?.(draft))}
      min={kind === "integer" ? (min ?? 0) : kind === "money" || kind === "percent" ? 0 : undefined}
      max={kind === "percent" ? 100 : undefined}
      step={kind === "money" || kind === "percent" ? ".01" : kind === "integer" ? 1 : undefined}
      maxLength={maxLength} placeholder={placeholder} value={val}
      onChange={e => change(kind === "integer" || kind === "money" || kind === "percent" ?
        e.target.value === "" ? null : Number(e.target.value) : e.target.value)} />}
  </label>;
}

export default function SpecializedOpportunityComposer({
  draft, field, step, questions, opportunity, upload, uploading, locked,
  organizationId, lockedForm,
}) {
  const job = draft.type === "JOB", key = job ? "jobSpecification" : "scholarshipSpecification";
  const spec = { ...(job ? blankJobSpecification() : blankScholarshipSpecification()), ...draft[key] };
  const fields = job ? jobFields : scholarshipFields;
  const steps = job ? ["Job information", "Work location & salary", "Requirements & qualifications", "Application settings",
    "Recruitment & selection", "Preview & publish"] :
    ["Scholarship information", "Funding & benefits", "Study destination & institution", "Eligibility requirements",
      "Application & selection", "Preview & publish"];
  const cover = draft.coverAssetId ? api.challengeAssetUrl(draft.coverAssetId) : null;
  const type = job ? "Job Vacancy" : "Scholarship";
  const salary = job ? formatJobSalary(draft.jobDetails) : null;
  const jobInfo = draft.jobDetails ? [JOB_TYPES[draft.jobDetails.type], JOB_COMPENSATION_TYPES[draft.jobDetails.compensationType]].filter(Boolean) : [];
  const summary = job ? salary || jobInfo.join(" · ") : [FUNDING[spec.fundingType], spec.scholarshipValue === null ? "" :
    (CURRENCIES[spec.currency] || "") + Number(spec.scholarshipValue).toLocaleString("en-US")].filter(Boolean).join(" · ");
  function write(path, value) {
    if (path.startsWith("spec.")) field(key, { ...spec, [path.slice(5)]: value });
    else if (path.startsWith("jobDetails.")) {
      const name = path.slice(11);
      const next = { type: "", compensationType: "", salaryMin: null, salaryMax: null, salaryCurrency: null,
        salaryPeriod: null, ...draft.jobDetails, [name]: value };
      if (name === "compensationType" && !["PAID", "STIPEND"].includes(value))
        Object.assign(next, { salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null });
      field("jobDetails", next);
    } else field(path, value);
  }
  return <div className="bw-op-challenge-composer bw-op-dedicated-composer">
    <aside className="bw-op-challenge-cover-column" aria-label={type + " live preview"}>
      <div className="bw-op-challenge-cover-stage bw-op-standard-preview-stage">
        {cover ? <img src={cover} alt={type + " cover preview"} /> :
          <div className="bw-op-standard-poster">
            <span className="bw-op-standard-poster-symbol"><NavigationIcon name={job ? "work" : "learning"} size={30} /></span>
            <span className="bw-op-standard-poster-kind">{type}</span>
            <strong>{draft.title || "Your " + type.toLowerCase() + " title"}</strong>
            <small>{job ? "Recruit talent" : "Support learners"}</small>
          </div>}
      </div>
      <div className="bw-op-challenge-cover-tools">
        <label className="bw-op-wizard-upload">
          {uploading === "COVER" ? "Uploading…" : cover ? "Change cover" : "Upload cover"}
          <input type="file" accept="image/jpeg,image/png,image/webp" aria-label={type + " cover photo"}
            disabled={locked || uploading === "COVER"} onChange={e => {
              const file = e.target.files?.[0]; e.target.value = ""; if (file) upload("COVER", file);
            }} />
        </label>
        {cover && <button type="button" className="bw-op-text-button" disabled={locked}
          onClick={() => field("coverAssetId", null)}>Remove image</button>}
      </div>
      <p className="bw-op-challenge-cover-help">Optional cover · JPEG, PNG, WebP · Up to 5 MB.</p>
      <div className="bw-dedicated-preview-details">
        <span>{type}</span><strong>{draft.title || "Opportunity title"}</strong>
        <p>{summary || "Details will appear as you complete the form."}</p>
        <p>{draft.location || "Location"} · {MODES[draft.workMode] || "In person"}</p>
        {draft.deadline && <small>Application deadline: {new Date(draft.deadline).toLocaleDateString("en-GB")}</small>}
        <div className="bw-dedicated-apply-preview">Apply Now</div>
      </div>
    </aside>
    <div className="bw-op-challenge-main bw-dedicated-main">
      <div className="bw-op-challenge-heading">
        <span className="bw-op-challenge-eyebrow">{type.toUpperCase()} · BRIGHTWAY</span>
        <span className="bw-op-challenge-audience">Step {step} of 6</span>
      </div>
      <h3 id="bw-op-step-heading" tabIndex={-1}>{steps[step - 1]}</h3>
      {step < 6 ? <>
        <div className="bw-dedicated-fields">{fields[step].map(config => <Field key={config.key} config={config}
          draft={draft} spec={spec} write={write} />)}</div>
        {((job && step === 4) || (!job && step === 5)) && <>
          <DocumentRequirements draft={draft} field={field} specKey={key} />
          <section className="bw-op-challenge-section bw-op-challenge-questions">{questions}</section>
          <p className="bw-op-challenge-native"><NavigationIcon name="security" size={18} />
            Applications, screening answers and attachments stay on BrightWay.</p>
        </>}
        {job && step === 5 && <Reviewers organizationId={organizationId} value={spec.reviewerIds}
          onChange={value => write("spec.reviewerIds", value)} />}
        {!job && step === 4 && <p className="bw-dedicated-hint">Only request age or other sensitive eligibility criteria when lawful and genuinely necessary.</p>}
      </> : <section className="bw-dedicated-review">
        {cover && <img src={cover} alt="" />}
        <strong>{draft.title}</strong>
        <p>{draft.description}</p>
        <dl>
          <div><dt>Category</dt><dd>{spec.category}</dd></div>
          <div><dt>Location</dt><dd>{draft.location}</dd></div>
          <div><dt>{job ? "Job type" : "Funding"}</dt><dd>{summary}</dd></div>
          <div><dt>Application deadline</dt><dd>{new Date(draft.deadline).toLocaleString("en-GB")}</dd></div>
          <div><dt>Questions and documents</dt><dd>{draft.questions.length}</dd></div>
        </dl>
        <p>Save as a draft or publish this opportunity to BrightWay. Publishing makes it visible to eligible applicants.</p>
      </section>}
      {lockedForm && <p className="bw-dedicated-hint">Published application questions and required documents cannot be changed.</p>}
    </div>
  </div>;
}
