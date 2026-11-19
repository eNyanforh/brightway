import { useState } from "react";
import "./dedicated-opportunity-fields.css";
import { countries } from "../learning/countries";
import { JOB_TYPES, JOB_COMPENSATION_TYPES, JOB_SALARY_PERIODS, formatJobSalary } from "../../../../shared/opportunities.mjs";
import OpportunityDescriptionField from "./OpportunityDescriptionField";
import OpportunityDateTimePicker from "./OpportunityDateTimePicker";
import JobLocationPicker from "./JobLocationPicker";

const CATEGORIES = ["Technology", "Education", "Healthcare", "Finance", "Agriculture", "Engineering", "Administration", "Research", "Marketing", "Hospitality", "Other"];
const LEVELS = ["NO_EXPERIENCE", "ENTRY", "JUNIOR", "MID", "SENIOR", "MANAGER", "EXECUTIVE"];
const EDUCATION = ["NO_FORMAL_EDUCATION", "PRIMARY", "JUNIOR_HIGH", "HIGH_SCHOOL", "TVET", "CERTIFICATE", "DIPLOMA", "ASSOCIATE", "BACHELORS", "MASTERS", "DOCTORATE"];
const human = value => String(value || "").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const values = value => Array.isArray(value) ? value : [];
const fromLines = value => value.split("\n");
const toLines = value => values(value).join("\n");

function Group({ title, hint, children }) {
  return <section className="bw-op-challenge-section bw-op-job-group"><h4>{title}</h4>{hint && <p className="bw-op-job-hint">{hint}</p>}{children}</section>;
}
function Lines({ label, value, onChange, placeholder, required = false }) {
  return <label>{label}<textarea rows={3} aria-required={required} value={toLines(value)}
    onChange={e => onChange(fromLines(e.target.value))} placeholder={placeholder || "One item per line"} /></label>;
}
function Multi({ title, options, selected, onChange, search, setSearch }) {
  return <fieldset className="bw-op-detail-options bw-op-compact-picker"><legend>{title}</legend>
    <div className="bw-op-job-selected">{selected.length ? selected.map(v => options.find(([key]) => key === v)?.[1] || v).join(", ") : "Select one or more"}</div>
    <details><summary>Choose {title.toLowerCase()}</summary>
      <input type="search" aria-label={"Search " + title.toLowerCase()} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search options" />
      <div className="bw-op-detail-choices">{options.filter(([,label]) => label.toLowerCase().includes(search.toLowerCase())).map(([key,label]) =>
        <label key={key} className="bw-op-checkbox"><input type="checkbox" checked={selected.includes(key)}
          onChange={e => onChange(e.target.checked ? [...selected, key] : selected.filter(v => v !== key))} />{label}</label>)}</div>
    </details>
  </fieldset>;
}
function Advanced({ children }) {
  return <details className="bw-op-job-advanced"><summary>Advanced options <span>Optional settings</span></summary><div className="bw-op-job-advanced-body">{children}</div></details>;
}

export default function JobVacancySteps({ draft, field, step, questions, locked }) {
  const [categorySearch, setCategorySearch] = useState("");
  const [typeSearch, setTypeSearch] = useState("");
  const data = draft.details || {};
  const job = { type: "", compensationType: "", salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null, ...(draft.jobDetails || {}) };
  const set = (key, value) => field("details", { ...data, [key]: value });
  const pay = changes => field("jobDetails", { ...job, ...changes });
  const categoryValues = values(data.categories).length ? data.categories : data.category ? [data.category] : [];
  const types = values(data.jobTypes).length ? data.jobTypes : job.type ? [job.type] : [];
  const experience = values(data.experienceLevels).length ? data.experienceLevels : data.experienceLevel ? [data.experienceLevel] : [];
  const updateCategories = next => field("details", { ...data, categories: next, category: next[0] || "" });
  const updateTypes = next => {
    set("jobTypes", next);
    pay({ type: next[0] || "" });
  };
  const updateLevels = next => field("details", { ...data, experienceLevels: next, experienceLevel: next[0] || "",
    ...(next.includes("NO_EXPERIENCE") ? { experienceMonths: 0 } : {}) });
  const amountShown = ["PAID", "STIPEND"].includes(job.compensationType);
  const amountMode = data.amountMode === "FIXED" ? "FIXED" : "RANGE";
  const noExperience = experience.includes("NO_EXPERIENCE");
  const months = data.experienceMonths ?? 0;

  if (step === 1) return <>
    <label className="bw-op-challenge-title-field">Job Title
      <input required autoFocus minLength={3} maxLength={160} value={draft.title} placeholder="e.g. Research Assistant"
        onChange={e => field("title", e.target.value)} />
    </label>
    <Group title="Job Overview" hint="Explain the purpose of the role and what the successful candidate will contribute.">
      <OpportunityDescriptionField value={draft.description} onChange={v => field("description", v)} placeholder="Introduce the role, team and expected contribution."/>
    </Group>
    <Multi title="Job Categories" options={CATEGORIES.map(x => [x,x])} selected={categoryValues}
      onChange={updateCategories} search={categorySearch} setSearch={setCategorySearch}/>
    <Multi title="Job Types" options={Object.entries(JOB_TYPES)} selected={types}
      onChange={updateTypes} search={typeSearch} setSearch={setTypeSearch}/>
    <JobLocationPicker draft={draft} field={field} details={data} onDetails={v => field("details", v)} />
    <Advanced>
      <Group title="Vacancy details">
        <div className="bw-op-field-row">
          <label>Number of vacancies<input type="number" min="1" step="1" value={data.vacancies ?? 1}
            onChange={e => set("vacancies", e.target.value === "" ? null : Number(e.target.value))}/></label>
          <label>Expected start date<input type="date" value={data.startDate || ""} onChange={e => set("startDate", e.target.value || undefined)}/></label>
        </div>
        <p className="bw-op-job-hint">The cover photo upload is available beside the live preview in Job Details.</p>
      </Group>
    </Advanced>
  </>;

  if (step === 2) return <>
    <Group title="Compensation" hint="Pay information stays together and only relevant options appear.">
      <label>Compensation Type <select value={job.compensationType || ""} required onChange={e =>
        pay({ compensationType: e.target.value, salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null })}>
        <option value="">Select compensation</option>
        {["PAID","STIPEND","UNPAID"].map(x => <option key={x} value={x}>{JOB_COMPENSATION_TYPES[x]}</option>)}
      </select></label>
      {amountShown && <>
        <div className="bw-op-field-row">
          <label>Amount type<select value={amountMode} onChange={e => {
            set("amountMode", e.target.value);
            if (e.target.value === "FIXED" && job.salaryMin != null) pay({ salaryMax: job.salaryMin });
          }}><option value="RANGE">Salary / stipend range</option><option value="FIXED">Fixed amount</option></select></label>
          <label className="bw-op-checkbox"><input type="checkbox" checked={Boolean(data.negotiable)}
            onChange={e => set("negotiable", e.target.checked)}/>Negotiable</label>
        </div>
        <div className="bw-op-field-row">
          <label>{amountMode === "FIXED" ? "Amount (optional if undisclosed)" : "Minimum amount"}
            <input type="number" min="0" step="0.01" value={job.salaryMin ?? ""}
              onChange={e => { const n=e.target.value === "" ? null : Number(e.target.value); pay({ salaryMin:n, ...(amountMode === "FIXED" ? {salaryMax:n} : {}) }); }}/></label>
          {amountMode === "RANGE" && <label>Maximum amount<input type="number" min="0" step="0.01"
            value={job.salaryMax ?? ""} onChange={e => pay({ salaryMax:e.target.value === "" ? null : Number(e.target.value) })}/></label>}
        </div>
        <div className="bw-op-field-row">
          <label>Currency<select value={job.salaryCurrency || ""} onChange={e => pay({salaryCurrency:e.target.value || null})}>
            <option value="">Choose currency</option>{["USD","LRD","GHS","NGN","GBP","EUR","CAD","AUD","KES","ZAR"].map(c=><option key={c} value={c}>{c}</option>)}
          </select></label>
          <label>Payment Frequency<select value={job.salaryPeriod || ""} onChange={e => pay({salaryPeriod:e.target.value || null})}>
            <option value="">Choose frequency</option>{Object.entries(JOB_SALARY_PERIODS).map(([key,label])=><option key={key} value={key}>{human(label)}</option>)}
          </select></label>
        </div>
      </>}
    </Group>
    <Group title="Experience" hint="Select all suitable seniority levels and set the minimum relevant work experience.">
      <div className="bw-op-detail-choices">{LEVELS.map(level=><label key={level} className="bw-op-checkbox">
        <input type="checkbox" checked={experience.includes(level)} onChange={e => updateLevels(e.target.checked ? [...experience, level] : experience.filter(v => v!==level))}/>{human(level)}
      </label>)}</div>
      {noExperience ? <p>No previous experience is required.</p> : <div className="bw-op-field-row">
        <label>Minimum years<input type="number" min="0" step="1" value={Math.floor(months/12)} onChange={e=>set("experienceMonths",Number(e.target.value||0)*12 + months%12)}/></label>
        <label>Additional months<select value={months%12} onChange={e=>set("experienceMonths",Math.floor(months/12)*12+Number(e.target.value))}>
          {Array.from({length:12},(_,i)=><option key={i} value={i}>{i}</option>)}
        </select></label>
      </div>}
    </Group>
    <Group title="Education">
      <label>Minimum Education Qualification<select value={data.education || ""} onChange={e=>set("education",e.target.value)}>
        <option value="">Choose minimum qualification</option>{EDUCATION.map(x=><option value={x} key={x}>{human(x)}</option>)}
      </select></label>
      {data.education !== "NO_FORMAL_EDUCATION" && <Lines label="Acceptable Fields of Study (optional)" value={data.fieldsOfStudy}
        onChange={v=>set("fieldsOfStudy",v)} placeholder="e.g. Economics\nFinance\nAccounting" />}
    </Group>
    <Group title="Skills">
      <Lines label="Required Skills" value={data.requiredSkills} onChange={v=>set("requiredSkills",v)} placeholder="One skill per line"/>
      <Lines label="Preferred Skills (optional)" value={data.preferredSkills} onChange={v=>set("preferredSkills",v)} placeholder="One skill per line"/>
    </Group>
    <Group title="Key Responsibilities">
      <Lines label="Responsibilities" value={data.responsibilities} onChange={v=>set("responsibilities",v)} required
        placeholder="Add at least one responsibility, each on a separate line"/>
    </Group>
    <Advanced>
      <Group title="Additional requirements">
        <Lines label="Additional Required Qualifications" value={data.requiredQualifications} onChange={v=>set("requiredQualifications",v)}/>
        <Lines label="Additional Preferred Qualifications" value={data.preferredQualifications} onChange={v=>set("preferredQualifications",v)}/>
        <Lines label="Professional Certifications and Licenses" value={data.certifications} onChange={v=>set("certifications",v)}/>
        <Lines label="Language Requirements" value={data.languages} onChange={v=>set("languages",v)}/>
        <Lines label="Benefits and Perks" value={data.benefits} onChange={v=>set("benefits",v)}/>
      </Group>
    </Advanced>
  </>;

  if (step === 3) return <>
    <Group title="Application Deadline">
      <OpportunityDateTimePicker value={draft.deadline} onChange={v => field("deadline",v)}/>
    </Group>
    <Group title="Application Documents" hint="Choose whether each document is required, optional, or not requested. Applicants upload directly on BrightWay.">
      {[
        ["CV / résumé","requireCv","cvStatus"],
        ["Cover Letter","requireCoverLetter","coverLetterStatus"],
        ["Portfolio","requirePortfolio","portfolioStatus"],
      ].map(([name,key,statusKey])=><label key={key}>{name}<select
        value={data[statusKey] || (data[key] ? "required" : "none")}
        disabled={locked} onChange={e=>field("details",{...data,[statusKey]:e.target.value,[key]:e.target.value==="required"})}>
        <option value="none">Not requested</option><option value="optional">Optional</option><option value="required">Required</option>
      </select></label>)}
    </Group>
    <Advanced>
      <Group title="Additional Application Settings">
        <Lines label="Other Required Documents" value={data.additionalDocuments} onChange={v=>set("additionalDocuments",v)}/>
        <label>Application Limit (optional)<input type="number" min="1" step="1" value={data.applicationLimit ?? ""}
          onChange={e=>set("applicationLimit",e.target.value === "" ? null : Number(e.target.value))}/></label>
        <p className="bw-op-job-hint">Leave the application limit empty to accept unlimited applications.</p>
      </Group>
      <Group title="Screening Questions" hint="Only job-related questions should be asked. No external application links.">
        {questions}
      </Group>
      <Group title="Recruitment Settings" hint="Review and final selection are the standard workflow. Detailed team assignments belong in vacancy management.">
        <div className="bw-op-detail-choices">{["APPLICATION_REVIEW","SHORTLISTING","ASSESSMENT","INTERVIEW","FINAL_SELECTION"].map(x=>
          <label key={x} className="bw-op-checkbox"><input type="checkbox"
            checked={values(data.recruitmentStages).includes(x)} onChange={e=>set("recruitmentStages",e.target.checked ? [...values(data.recruitmentStages),x] : values(data.recruitmentStages).filter(v=>v!==x))}/>{human(x)}</label>)}</div>
        <label>Target Hiring Date (optional)<input type="date" value={data.hiringDate || ""} onChange={e=>set("hiringDate",e.target.value||undefined)}/></label>
      </Group>
    </Advanced>
  </>;

  if (step === 4) return <section className="bw-op-challenge-section" aria-label="Review job vacancy">
    <h4>Review Job Vacancy</h4>
    <p>Review your public listing. Return to any step to make changes, then save a draft or publish.</p>
    <div className="bw-op-wizard-review">
      <strong>{draft.title || "Untitled vacancy"}</strong>
      <p>{draft.description}</p>
      <dl>
        <div><dt>Categories</dt><dd>{categoryValues.join(", ") || "Not specified"}</dd></div>
        <div><dt>Job types</dt><dd>{types.map(x=>JOB_TYPES[x]).join(", ") || "Not specified"}</dd></div>
        <div><dt>Work arrangement</dt><dd>{human(draft.workMode)}</dd></div>
        <div><dt>Location</dt><dd>{draft.location || "Not specified"}</dd></div>
        <div><dt>Compensation</dt><dd>{JOB_COMPENSATION_TYPES[job.compensationType] || "Not specified"}{formatJobSalary(job) ? " · " + formatJobSalary(job) : ""}{data.negotiable ? " · Negotiable" : ""}</dd></div>
        <div><dt>Experience</dt><dd>{experience.map(human).join(", ") || "Not specified"}</dd></div>
        <div><dt>Education</dt><dd>{human(data.education)}{values(data.fieldsOfStudy).filter(Boolean).length ? " in " + values(data.fieldsOfStudy).filter(Boolean).join(", ") : ""}</dd></div>
        <div><dt>Responsibilities</dt><dd>{values(data.responsibilities).filter(Boolean).join(" · ") || "Not specified"}</dd></div>
        <div><dt>Deadline</dt><dd>{draft.deadline ? new Date(draft.deadline).toLocaleString("en-GB") : "Not set"}</dd></div>
      </dl>
    </div>
  </section>;
  return null;
}
