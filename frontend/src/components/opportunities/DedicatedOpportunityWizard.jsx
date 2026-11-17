import { OPPORTUNITY_TYPES, JOB_TYPES, JOB_COMPENSATION_TYPES, JOB_SALARY_PERIODS, formatJobSalary } from "../../../../shared/opportunities.mjs";
import { requiredDocumentLabels } from "../../../../shared/opportunity-documents.mjs";
import { opportunitiesApi as api } from "../../api/opportunities";
import NavigationIcon from "../layout/NavigationIcon";
import OpportunityDateTimePicker from "./OpportunityDateTimePicker";
import OpportunityDescriptionField from "./OpportunityDescriptionField";
import DedicatedOpportunityFields from "./DedicatedOpportunityFields";

const descriptions = {
  JOB: ["Job information", "Location and salary", "Qualifications", "Application settings", "Recruitment and selection", "Preview and save"],
  SCHOLARSHIP: ["Scholarship information", "Funding and benefits", "Study destination", "Eligibility", "Applications and selection", "Preview and save"],
};
const display = name => name ? name.replaceAll("_", " ").replace(/\b\w/g, l => l.toUpperCase()) : "Not specified";
const currency = (value, code) => code && value != null
  ? new Intl.NumberFormat("en-US", { style: "currency", currency: code, maximumFractionDigits: 2 }).format(value) : null;

function EmploymentFields({ draft, field }) {
  const details = draft.jobDetails || {};
  const update = changes => field("jobDetails", { ...details, ...changes });
  const salary = ["PAID", "STIPEND"].includes(details.compensationType);
  return <section className="bw-op-challenge-section" aria-label="Employment and compensation">
    <h4>Employment and compensation</h4>
    <div className="bw-op-field-row">
      <label>Job type <select value={details.type || ""} required onChange={e => update({ type: e.target.value })}>
        <option value="">Select job type</option>{Object.entries(JOB_TYPES).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
      </select></label>
      <label>Compensation <select value={details.compensationType || ""} required onChange={e => update({
        compensationType: e.target.value, salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null,
      })}><option value="">Select compensation</option>
        {Object.entries(JOB_COMPENSATION_TYPES).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
      </select></label>
    </div>
    {salary && <><p>Salary disclosure is optional. If disclosed, provide both amounts, a currency and a period.</p>
      <div className="bw-op-field-row">
        <label>Minimum salary <input type="number" min="0" step="0.01" value={details.salaryMin ?? ""} onChange={e => update({ salaryMin: e.target.value === "" ? null : Number(e.target.value) })} /></label>
        <label>Maximum salary <input type="number" min="0" step="0.01" value={details.salaryMax ?? ""} onChange={e => update({ salaryMax: e.target.value === "" ? null : Number(e.target.value) })} /></label>
      </div><div className="bw-op-field-row">
        <label>Currency <select value={details.salaryCurrency || ""} onChange={e => update({ salaryCurrency: e.target.value || null })}>
          <option value="">Select currency</option>{["USD", "LRD", "EUR", "GBP"].map(c => <option key={c} value={c}>{c}</option>)}
        </select></label>
        <label>Pay period <select value={details.salaryPeriod || ""} onChange={e => update({ salaryPeriod: e.target.value || null })}>
          <option value="">Select period</option>{Object.entries(JOB_SALARY_PERIODS).map(([key, value]) => <option key={key} value={key}>Per {value}</option>)}
        </select></label>
      </div>
    </>}
  </section>;
}
function LocationFields({ draft, field, scholarship }) {
  return <section className="bw-op-challenge-section" aria-label={scholarship ? "Study mode and location" : "Work mode and location"}>
    <h4>{scholarship ? "Study mode and destination" : "Work location"}</h4>
    <div className="bw-op-field-row">
      <label>{scholarship ? "Study mode" : "Work mode"} <select value={draft.workMode} onChange={e => field("workMode", e.target.value)}>
        <option value="IN_PERSON">In person</option><option value="REMOTE">Remote / Online</option><option value="HYBRID">Hybrid</option>
      </select></label>
      <label>{scholarship ? "Study destination" : "Work location"} <input required minLength={2} maxLength={180}
        value={draft.location} placeholder={scholarship ? "University, country or Worldwide" : "Monrovia, Liberia or Remote"}
        onChange={e => field("location", e.target.value)} /></label>
    </div>
  </section>;
}
function Review({ draft }) {
  const d = draft.details || {};
  const scholarship = draft.type === "SCHOLARSHIP";
  const fields = scholarship ? [
    ["Funding", display(d.fundingType)], ["Scholarship value", currency(d.value, d.currency) || "Not disclosed"],
    ["Academic levels", (d.academicLevels || []).map(display).join(", ")],
    ["Eligible countries", (d.eligibleCountries || []).join(", ")],
    ["Institution", d.institution || "Various / not specified"],
    ["Selection criteria", (d.selectionCriteria || []).join(" · ")],
  ] : [
    ["Job type", JOB_TYPES[draft.jobDetails?.type] || "Not specified"],
    ["Compensation", JOB_COMPENSATION_TYPES[draft.jobDetails?.compensationType] || "Not specified"],
    ["Salary", formatJobSalary(draft.jobDetails) || "Not disclosed"],
    ["Experience level", display(d.experienceLevel)],
    ["Responsibilities", (d.responsibilities || []).join(" · ")],
    ["Required qualifications", (d.requiredQualifications || []).join(" · ")],
  ];
  return <section className="bw-op-challenge-section" aria-label="Review opportunity">
    <h4>Preview before saving</h4>
    <p>Review the listing and document requirements. The opportunity is saved as a draft and published separately from the organization's dashboard.</p>
    <div className="bw-op-wizard-review">
      <strong>{draft.title}</strong><p>{draft.description}</p>
      <dl><div><dt>Location</dt><dd>{draft.location}</dd></div>
        <div><dt>Mode</dt><dd>{display(draft.workMode)}</dd></div>
        <div><dt>Deadline</dt><dd>{draft.deadline ? new Date(draft.deadline).toLocaleString("en-GB") : "Not set"}</dd></div>
        {fields.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value || "Not specified"}</dd></div>)}
        <div><dt>Required documents</dt><dd>{requiredDocumentLabels(draft.type, d).join(", ") || "None"}</dd></div>
        <div><dt>Additional application questions</dt><dd>{draft.questions.filter(q => !q.label.startsWith("Required document: ")).length}</dd></div>
      </dl>
    </div>
  </section>;
}

export default function DedicatedOpportunityWizard({ draft, field, step, questions, locked, uploading, upload, opportunity }) {
  const type = OPPORTUNITY_TYPES[draft.type];
  const scholarship = draft.type === "SCHOLARSHIP";
  const index = step - 1;
  const coverUrl = draft.coverAssetId ? api.challengeAssetUrl(draft.coverAssetId) : null;
  const details = draft.details || {};
  return <div className="bw-op-challenge-composer bw-op-standard-composer bw-op-dedicated-wizard">
    <aside className="bw-op-challenge-cover-column" aria-label="Live listing preview">
      <div className="bw-op-challenge-cover-stage bw-op-standard-preview-stage">
        {coverUrl ? <img src={coverUrl} alt="Opportunity cover preview" /> : <div className="bw-op-standard-poster">
          <span className="bw-op-standard-poster-symbol"><NavigationIcon name={type.icon} size={30}/></span>
          <span className="bw-op-standard-poster-kind">{draft.type === "JOB" ? "Job Vacancy" : "Scholarship"}</span>
          <strong>{draft.title || "Opportunity title"}</strong>
          <small>{scholarship ? display(details.fundingType) : JOB_TYPES[draft.jobDetails?.type] || "Employment"}</small>
        </div>}
      </div>
      <div className="bw-op-challenge-cover-tools">
        <label className="bw-op-wizard-upload">{uploading === "COVER" ? "Uploading…" : coverUrl ? "Change cover photo" : "Upload cover photo"}
          <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Opportunity cover photo"
            disabled={locked || Boolean(uploading)} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) upload("COVER", file); }}/>
        </label>
        {coverUrl && <button type="button" className="bw-op-text-button" onClick={() => field("coverAssetId", null)}>Remove photo</button>}
      </div>
      <p className="bw-op-challenge-cover-help">Optional JPEG, PNG or WebP · 5 MB maximum.</p>
      <div className="bw-op-dedicated-preview-facts">
        <strong>{scholarship ? "Funding" : "Compensation"}</strong>
        <p>{scholarship ? display(details.fundingType) : JOB_COMPENSATION_TYPES[draft.jobDetails?.compensationType] || "Not specified"}</p>
        {scholarship && currency(details.value, details.currency) && <p>{currency(details.value, details.currency)}</p>}
        {!scholarship && formatJobSalary(draft.jobDetails) && <p>{formatJobSalary(draft.jobDetails)}</p>}
        <p>{draft.location || "Location not set"}</p>
        <p>{draft.deadline ? "Deadline: " + new Date(draft.deadline).toLocaleDateString("en-GB") : "Deadline not set"}</p>
      </div>
    </aside>
    <div className="bw-op-challenge-main bw-op-standard-main">
      <div className="bw-op-challenge-heading">
        <span className="bw-op-challenge-eyebrow">{scholarship ? "SCHOLARSHIP" : "JOB VACANCY"} · BRIGHTWAY</span>
        <span className="bw-op-challenge-audience"><NavigationIcon name="globe" size={15}/> Discoverable on BrightWay</span>
      </div>
      <h3 id="bw-op-step-heading" tabIndex={-1}>{descriptions[draft.type][index]}</h3>
      {step === 1 && <>
        <label className="bw-op-challenge-title-field">{scholarship ? "Scholarship title" : "Job title"}
          <input required autoFocus minLength={3} maxLength={160} value={draft.title}
            placeholder={scholarship ? "Undergraduate research scholarship" : "Junior software engineer"}
            onChange={e => field("title", e.target.value)} />
        </label>
        <section className="bw-op-challenge-section">
          <h4>Description</h4>
          <OpportunityDescriptionField value={draft.description}
            placeholder={scholarship ? "Explain the scholarship, purpose and selection process." : "Describe the role, team and impact."}
            onChange={v => field("description", v)} />
        </section>
        {!scholarship && <EmploymentFields draft={draft} field={field} />}
        <DedicatedOpportunityFields type={draft.type} details={details} onChange={v => field("details", v)} section={1} locked={Boolean(opportunity?.publishedAt)}/>
      </>}
      {step === 2 && <>
        {!scholarship && <><LocationFields draft={draft} field={field} /><EmploymentFields draft={draft} field={field} /></>}
        <DedicatedOpportunityFields type={draft.type} details={details} onChange={v => field("details", v)} section={2} />
      </>}
      {step === 3 && <>
        {scholarship && <LocationFields draft={draft} field={field} scholarship />}
        <DedicatedOpportunityFields type={draft.type} details={details} onChange={v => field("details", v)} section={3} />
      </>}
      {step === 4 && <>
        <DedicatedOpportunityFields type={draft.type} details={details} onChange={v => field("details", v)} section={4} locked={Boolean(opportunity?.publishedAt)} />
        {!scholarship && <section className="bw-op-challenge-section">
          <h4>Application deadline</h4><OpportunityDateTimePicker value={draft.deadline} onChange={v => field("deadline", v)}/>
          {questions}
        </section>}
      </>}
      {step === 5 && <>
        <DedicatedOpportunityFields type={draft.type} details={details} onChange={v => field("details", v)} section={5} locked={Boolean(opportunity?.publishedAt)}/>
        {scholarship && <section className="bw-op-challenge-section">
          <h4>Application deadline</h4><OpportunityDateTimePicker value={draft.deadline} onChange={v => field("deadline", v)}/>
          {questions}
        </section>}
      </>}
      {step === 6 && <Review draft={draft}/>}
      <p className="bw-op-challenge-native"><NavigationIcon name="security" size={18}/>
        All applicant documents and screening answers are handled privately within BrightWay.</p>
    </div>
  </div>;
}
