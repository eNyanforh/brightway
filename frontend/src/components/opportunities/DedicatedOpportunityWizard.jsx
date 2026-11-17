import { OPPORTUNITY_TYPES, JOB_TYPES, JOB_COMPENSATION_TYPES, JOB_SALARY_PERIODS, formatJobSalary } from "../../../../shared/opportunities.mjs";
import { requiredDocumentLabels } from "../../../../shared/opportunity-documents.mjs";
import { countries } from "../learning/countries";
import VerificationBadge from "../VerificationBadge";
import { opportunitiesApi as api } from "../../api/opportunities";
import NavigationIcon from "../layout/NavigationIcon";
import OpportunityDateTimePicker from "./OpportunityDateTimePicker";
import OpportunityDescriptionField from "./OpportunityDescriptionField";
import DedicatedOpportunityFields from "./DedicatedOpportunityFields";

export const DEDICATED_STEPS = Object.freeze({
  JOB: ["Job Information", "Location & Salary", "Requirements", "Application Settings", "Recruitment & Selection", "Preview & Publish"],
  SCHOLARSHIP: ["Scholarship Information", "Funding & Benefits", "Study Destination", "Eligibility", "Application & Selection", "Preview & Publish"],
});

const readable = value => value ? String(value).replaceAll("_", " ").toLowerCase().replace(/\b\w/g, char => char.toUpperCase()) : "Not specified";
const payPeriodLabels = { HOUR: "Hourly", DAY: "Daily", WEEK: "Weekly", MONTH: "Monthly", YEAR: "Yearly" };
const currency = (value, code) => code && value != null
  ? new Intl.NumberFormat("en-US", { style: "currency", currency: code, maximumFractionDigits: 2 }).format(value)
  : null;
const locationMode = mode => mode === "REMOTE" ? "Remote" : mode === "HYBRID" ? "Hybrid" : "In-person";

function Preview({ draft, organization, uploading, upload, locked }) {
  const job = draft.type === "JOB";
  const detail = draft.details || {};
  const employment = draft.jobDetails || {};
  const coverUrl = draft.coverAssetId ? api.challengeAssetUrl(draft.coverAssetId) : null;
  const place = [detail.city, job ? detail.country : detail.studyCountry].filter(Boolean).join(", ") || draft.location || "Location not specified";
  const salary = formatJobSalary(employment);
  const funding = detail.fundingType ? readable(detail.fundingType) : "Funding not specified";
  const label = OPPORTUNITY_TYPES[draft.type].label;
  return <aside className="bw-op-dedicated-preview" aria-label={"Live " + label + " preview"}>
    <div className="bw-op-dedicated-card">
      <div className="bw-op-dedicated-cover bw-op-standard-preview-stage" aria-label={label + " cover preview"}>
        {coverUrl ? <img src={coverUrl} alt={label + " cover photo preview"} /> : <div className="bw-op-dedicated-cover-placeholder">
          <NavigationIcon name={job ? "work" : "learning"} size={26} />
          <span>Cover preview</span>
        </div>}
      </div>
      <label className="bw-op-dedicated-upload">
        <NavigationIcon name="image" size={15} />
        {uploading === "COVER" ? "Uploading cover…" : coverUrl ? "Change cover photo" : "Upload cover photo"}
        <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Opportunity cover photo"
          disabled={locked || Boolean(uploading)} onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) upload("COVER", file);
          }} />
      </label>
      <h4 className="bw-op-dedicated-preview-title">{draft.title.trim() || (job ? "Job title" : "Scholarship title")}</h4>
      <div className="bw-op-dedicated-preview-organization">
        <span>{organization?.name || "Organization name"}</span>
        {Boolean(organization?.verifiedAt) && <VerificationBadge kind="organization" />}
      </div>
      <div className="bw-op-dedicated-preview-badges">
        {job ? <>
          {employment.type && <span>{JOB_TYPES[employment.type] || readable(employment.type)}</span>}
          {employment.compensationType && <span>{JOB_COMPENSATION_TYPES[employment.compensationType] || readable(employment.compensationType)}</span>}
        </> : <>
          {detail.fundingType && <span>{funding}</span>}
          {Array.isArray(detail.academicLevels) && detail.academicLevels.slice(0, 2).map(level =>
            <span key={level}>{readable(level)}</span>)}
        </>}
      </div>
      <p className="bw-op-dedicated-preview-location">{place} · {locationMode(draft.workMode)}</p>
      <div className="bw-op-dedicated-preview-reward">
        <span>{job ? "SALARY" : "FUNDING"}</span>
        <strong>{job ? (salary || (["PAID", "STIPEND"].includes(employment.compensationType) ? "Salary not disclosed" : "Not specified"))
          : (currency(detail.value, detail.currency) || funding)}</strong>
      </div>
      <span className="bw-op-dedicated-preview-cta" aria-label="Apply Now — card preview only">Apply Now</span>
      <p className="bw-op-dedicated-preview-note">Preview only · Applications take place on BrightWay</p>
    </div>
  </aside>;
}

function JobInformation({ draft, field }) {
  const data = draft.jobDetails || {};
  return <>
    <label className="bw-op-dedicated-title-input">Job title
      <input autoFocus required minLength={3} maxLength={160} value={draft.title}
        placeholder="Software Developer" onChange={e => field("title", e.target.value)} />
    </label>
    <section className="bw-op-dedicated-field-section">
      <h4>Description</h4>
      <OpportunityDescriptionField value={draft.description}
        placeholder="Describe the job, responsibilities and impact."
        onChange={value => field("description", value)} />
    </section>
    <label>Job type
      <select required value={data.type || ""} onChange={e => field("jobDetails", {
        type: e.target.value,
        compensationType: data.compensationType || "PAID",
        salaryMin: data.salaryMin ?? null, salaryMax: data.salaryMax ?? null,
        salaryCurrency: data.salaryCurrency || null, salaryPeriod: data.salaryPeriod || null,
      })}>
        <option value="">Select job type</option>
        {Object.entries(JOB_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    <DedicatedOpportunityFields type="JOB" details={draft.details}
      onChange={value => field("details", value)} section={1}/>
  </>;
}

function JobLocationAndSalary({ draft, field }) {
  const job = draft.jobDetails || {};
  const details = draft.details || {};
  const updateJob = values => field("jobDetails", { ...job, ...values });
  const updateDetails = (key, value) => field("details", { ...details, [key]: value });
  const salary = ["PAID", "STIPEND"].includes(job.compensationType);
  return <div className="bw-op-dedicated-step-fields">
    <label>Work Mode
      <select value={draft.workMode} onChange={e => field("workMode", e.target.value)}>
        <option value="IN_PERSON">In-person</option>
        <option value="REMOTE">Remote</option>
        <option value="HYBRID">Hybrid</option>
      </select>
    </label>
    <label>Country
      <input list="bw-op-dedicated-countries" value={details.country || ""}
        placeholder="Choose or search a country" onChange={e => updateDetails("country", e.target.value)} />
      <datalist id="bw-op-dedicated-countries">
        {countries.map(country => <option value={country.name} key={country.name} />)}
      </datalist>
    </label>
    {salary && <>
      <div className="bw-op-dedicated-salary-group">
        <span>Salary Range <small>(optional)</small></span>
        <div className="bw-op-dedicated-salary-inputs">
          <label>Minimum salary
            <input type="number" min="0" max="1000000000" step="0.01"
              value={job.salaryMin ?? ""} placeholder="500"
              onChange={e => updateJob({ salaryMin: e.target.value === "" ? null : Number(e.target.value) })}/>
          </label>
          <label>Maximum salary
            <input type="number" min="0" max="1000000000" step="0.01"
              value={job.salaryMax ?? ""} placeholder="800"
              onChange={e => updateJob({ salaryMax: e.target.value === "" ? null : Number(e.target.value) })}/>
          </label>
        </div>
      </div>
      <label>Pay period
        <select value={job.salaryPeriod || ""} onChange={e => updateJob({ salaryPeriod: e.target.value || null })}>
          <option value="">Choose pay period</option>
          {Object.entries(JOB_SALARY_PERIODS).map(([value, label]) =>
            <option key={value} value={value}>{payPeriodLabels[value] || readable(label)}</option>)}
        </select>
      </label>
      <label>Currency
        <select value={job.salaryCurrency || ""} onChange={e => updateJob({ salaryCurrency: e.target.value || null })}>
          <option value="">Choose currency</option>
          {["USD", "LRD", "EUR", "GBP"].map(code => <option value={code} key={code}>
            {code === "USD" ? "US$ (USD)" : code === "LRD" ? "L$ (LRD)" : code}
          </option>)}
        </select>
      </label>
    </>}
    <label>Compensation
      <select required value={job.compensationType || ""}
        onChange={e => updateJob({ compensationType: e.target.value,
          salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null })}>
        <option value="">Select compensation</option>
        {Object.entries(JOB_COMPENSATION_TYPES).map(([value, label]) =>
          <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    <div className="bw-op-dedicated-field-row">
      <label>County / State
        <input value={details.region || ""} onChange={e => updateDetails("region", e.target.value)}/>
      </label>
      <label>City
        <input value={details.city || ""} placeholder="Monrovia"
          onChange={e => updateDetails("city", e.target.value)}/>
      </label>
    </div>
    <label>Work location
      <input required minLength={2} maxLength={180} value={draft.location}
        placeholder="Monrovia, Liberia or Remote" onChange={e => field("location", e.target.value)}/>
    </label>
    <label>Work address (optional)
      <input value={details.address || ""} onChange={e => updateDetails("address", e.target.value)}/>
    </label>
    <label>Additional benefits <small>(one per line)</small>
      <textarea rows={3} value={(details.benefits || []).join("\n")}
        onChange={e => updateDetails("benefits", e.target.value.split("\n"))}/>
    </label>
  </div>;
}

function StudyModeAndDestination({ draft, field }) {
  return <section className="bw-op-dedicated-field-section">
    <div className="bw-op-dedicated-field-row">
      <label>Study mode
        <select value={draft.workMode} onChange={e => field("workMode", e.target.value)}>
          <option value="IN_PERSON">In-person</option>
          <option value="REMOTE">Remote / Online</option>
          <option value="HYBRID">Hybrid</option>
        </select>
      </label>
      <label>Study destination
        <input required minLength={2} maxLength={180}
          value={draft.location} placeholder="University, country or Worldwide"
          onChange={e => field("location", e.target.value)}/>
      </label>
    </div>
  </section>;
}

function Review({ draft }) {
  const d = draft.details || {};
  const job = draft.type === "JOB";
  const jobInfo = draft.jobDetails || {};
  const rows = job ? [
    ["Job type", JOB_TYPES[jobInfo.type] || "Not specified"],
    ["Compensation", JOB_COMPENSATION_TYPES[jobInfo.compensationType] || "Not specified"],
    ["Salary", formatJobSalary(jobInfo) || "Not disclosed"],
    ["Experience level", readable(d.experienceLevel)],
    ["Responsibilities", (d.responsibilities || []).join(" · ")],
    ["Required qualifications", (d.requiredQualifications || []).join(" · ")],
  ] : [
    ["Funding", readable(d.fundingType)],
    ["Scholarship value", currency(d.value, d.currency) || "Not disclosed"],
    ["Academic levels", (d.academicLevels || []).map(readable).join(", ")],
    ["Eligible countries", (d.eligibleCountries || []).join(", ")],
    ["Institution", d.institution || "Not specified"],
    ["Selection criteria", (d.selectionCriteria || []).join(" · ")],
  ];
  return <section className="bw-op-dedicated-review">
    <h4>Review before publishing</h4>
    <p>Confirm the information and application requirements. Save an unpublished draft or publish on BrightWay.</p>
    <dl>
      <div><dt>Title</dt><dd>{draft.title}</dd></div>
      <div><dt>Location</dt><dd>{draft.location || "Not specified"}</dd></div>
      <div><dt>Mode</dt><dd>{locationMode(draft.workMode)}</dd></div>
      <div><dt>Deadline</dt><dd>{draft.deadline ? new Date(draft.deadline).toLocaleString("en-GB") : "Not set"}</dd></div>
      {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Not specified"}</dd></div>)}
      <div><dt>Required documents</dt><dd>{requiredDocumentLabels(draft.type, d).join(", ") || "None"}</dd></div>
      <div><dt>Custom application questions</dt><dd>{draft.questions.filter(q => !q.label.startsWith("Required document: ")).length}</dd></div>
    </dl>
  </section>;
}

export default function DedicatedOpportunityWizard({ draft, field, step, questions, locked, uploading, upload, opportunity, organization }) {
  const type = draft.type;
  const title = DEDICATED_STEPS[type][step - 1];
  const scholarship = type === "SCHOLARSHIP";
  const details = draft.details || {};
  return <div className="bw-op-dedicated-wizard bw-op-dedicated-layout">
    <Preview draft={draft} organization={organization || opportunity?.organization}
      locked={locked} uploading={uploading} upload={upload}/>
    <div className="bw-op-dedicated-form-column">
      <h3 id="bw-op-step-heading" tabIndex={-1} className="bw-op-dedicated-section-heading">{title}</h3>
      {step === 1 && (scholarship ? <>
        <label className="bw-op-dedicated-title-input">Scholarship title
          <input autoFocus required minLength={3} maxLength={160} value={draft.title}
            placeholder="Undergraduate research scholarship"
            onChange={e => field("title", e.target.value)}/>
        </label>
        <section className="bw-op-dedicated-field-section">
          <h4>Description</h4>
          <OpportunityDescriptionField value={draft.description}
            placeholder="Explain the funding opportunity and its purpose."
            onChange={v => field("description", v)}/>
        </section>
        <DedicatedOpportunityFields type={type} details={details}
          onChange={v => field("details", v)} section={1}/>
      </> : <JobInformation draft={draft} field={field}/>)}
      {step === 2 && (scholarship ? <DedicatedOpportunityFields type={type} details={details}
        onChange={v => field("details", v)} section={2}/>
        : <JobLocationAndSalary draft={draft} field={field}/>)}
      {step === 3 && <>
        {scholarship && <StudyModeAndDestination draft={draft} field={field}/>}
        <DedicatedOpportunityFields type={type} details={details}
          onChange={v => field("details", v)} section={3}/>
      </>}
      {step === 4 && <>
        <DedicatedOpportunityFields type={type} details={details}
          onChange={v => field("details", v)} section={4} locked={Boolean(opportunity?.publishedAt)}/>
        {!scholarship && <section className="bw-op-dedicated-field-section">
          <h4>Application deadline</h4>
          <OpportunityDateTimePicker value={draft.deadline} onChange={v => field("deadline", v)}/>
          {questions}
        </section>}
      </>}
      {step === 5 && <>
        <DedicatedOpportunityFields type={type} details={details}
          onChange={v => field("details", v)} section={5} locked={Boolean(opportunity?.publishedAt)}/>
        {scholarship && <section className="bw-op-dedicated-field-section">
          <h4>Application deadline</h4>
          <OpportunityDateTimePicker value={draft.deadline} onChange={v => field("deadline", v)}/>
          {questions}
        </section>}
      </>}
      {step === 6 && <Review draft={draft}/>}
      <p className="bw-op-dedicated-private"><NavigationIcon name="security" size={15}/>
        Applications, documents, and screening answers remain on BrightWay.</p>
    </div>
  </div>;
}
