import { useState } from "react";
import { OPPORTUNITY_TYPES, JOB_TYPES, JOB_COMPENSATION_TYPES, formatJobSalary } from "../../../../shared/opportunities.mjs";
import { requiredDocumentLabels } from "../../../../shared/opportunity-documents.mjs";
import { opportunityPublicationIssues } from "../../../../shared/opportunity-readiness.mjs";
import { scholarshipDeadlineToIso } from "../../../../shared/opportunity-timezone.mjs";
import { opportunitiesApi as api } from "../../api/opportunities";
import NavigationIcon from "../layout/NavigationIcon";
import OpportunityDateTimePicker from "./OpportunityDateTimePicker";
import OpportunityDescriptionField from "./OpportunityDescriptionField";
import ScholarshipCreationFields from "./ScholarshipCreationFields";
import JobVacancySteps from "./JobVacancySteps";

const descriptions = {
  JOB: ["Job Details", "Pay & Requirements", "Applications", "Review & Publish"],
  SCHOLARSHIP: ["Basic Information", "Award Details", "Eligibility Criteria", "Application Requirements", "Timeline", "Selection Process", "Review & Publish"],
};
const display = name => name ? name.replaceAll("_", " ").replace(/\b\w/g, l => l.toUpperCase()) : "Not specified";
const currency = (value, code) => code && value != null
  ? new Intl.NumberFormat("en-US", { style: "currency", currency: code, maximumFractionDigits: 2 }).format(value) : null;

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
  let reviewDeadline = draft.deadline;
  if (scholarship && draft.deadline) {
    try { reviewDeadline = scholarshipDeadlineToIso(draft.deadline, d.deadlineTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"); }
    catch { /* An invalid deadline is shown as a validation issue below. */ }
  }
  const issues = scholarship ? opportunityPublicationIssues({ ...draft, deadline: reviewDeadline }) : [];
  return <section className="bw-op-challenge-section" aria-label="Review opportunity">
    <h4>Review before publishing</h4>
    <p>Review the public listing and application requirements. Incomplete items must be corrected before publishing.</p>
    {scholarship && <div className="bw-scholarship-checklist" role="status">
      <strong>{issues.length ? issues.length + " publication checks need attention" : "All publication checks passed"}</strong>
      {issues.length > 0 && <ul>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
    </div>}
    <div className="bw-op-wizard-review">
      <strong>{draft.title}</strong><p>{draft.description}</p>
      <dl><div><dt>Location</dt><dd>{draft.location}</dd></div>
        <div><dt>Mode</dt><dd>{display(draft.workMode)}</dd></div>
        <div><dt>Deadline</dt><dd>{draft.deadline ? (scholarship ? draft.deadline.replace("T", " ") + " (" + (d.deadlineTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC") + ")" : new Date(draft.deadline).toLocaleString("en-GB")) : "Not set"}</dd></div>
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
  const [previewOpen, setPreviewOpen] = useState(false);
  return <div className="bw-op-challenge-composer bw-op-standard-composer bw-op-dedicated-wizard">
    <button type="button" className="bw-op-creation-preview-toggle"
      aria-controls="bw-op-dedicated-preview" aria-expanded={previewOpen}
      onClick={() => setPreviewOpen(current => !current)}>
      <NavigationIcon name="eye" size={17}/>{previewOpen ? "Hide preview" : (scholarship || step === 1 ? "Preview & cover photo" : "Preview listing")}
    </button>
    <aside id="bw-op-dedicated-preview" aria-label="Live listing preview"
      className={"bw-op-challenge-cover-column bw-op-creation-preview" + (previewOpen ? " is-mobile-open" : "")}>
      <div className="bw-op-creation-preview-heading"><strong>LIVE PREVIEW</strong><span>Updates as you type</span></div>
      <div className="bw-op-creation-preview-card">
        <div className="bw-op-challenge-cover-stage bw-op-standard-preview-stage">
        {coverUrl ? <img src={coverUrl} alt="Opportunity cover preview" /> : <div className="bw-op-standard-poster">
          <span className="bw-op-standard-poster-symbol"><NavigationIcon name={type.icon} size={30}/></span>
          <span className="bw-op-standard-poster-kind">{draft.type === "JOB" ? "Job Vacancy" : "Scholarship"}</span>
          <strong>BRIGHTWAY</strong>
          <small>{scholarship ? display(details.fundingType) : JOB_TYPES[draft.jobDetails?.type] || "Employment"}</small>
        </div>}
        </div>
        <div className="bw-op-creation-listing">
          <span className="bw-op-creation-listing-type">{scholarship ? "SCHOLARSHIP" : "JOB VACANCY"}</span>
          <h4>{draft.title?.trim() || (scholarship ? "Your scholarship title" : "Your job title")}</h4>
          <p>{(scholarship && details.shortSummary?.trim()) || (draft.description?.trim()
            ? draft.description.trim().slice(0, 170) + (draft.description.trim().length > 170 ? "…" : "")
            : "Your description will appear here as you write.")}</p>
          <div className="bw-op-creation-preview-tags">
            <span>{display(draft.workMode)}</span>
            {draft.location && <span>{draft.location}</span>}
          </div>
        </div>
      </div>
      {(scholarship || step === 1) && <div className="bw-op-challenge-cover-tools">
        <label className="bw-op-wizard-upload">{uploading === "COVER" ? "Uploading…" : coverUrl ? "Change cover photo" : "Upload cover photo"}
          <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Opportunity cover photo"
            disabled={locked || Boolean(uploading)} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) upload("COVER", file); }}/>
        </label>
        {coverUrl && <button type="button" className="bw-op-text-button" onClick={() => field("coverAssetId", null)}>Remove photo</button>}
      </div>}
      {(scholarship || step === 1) && <p className="bw-op-challenge-cover-help">16:9 landscape recommended (1280 × 720 px or larger) · JPEG, PNG or WebP · 5 MB maximum.</p>}
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
      {scholarship ? <>
        {step === 1 && <>
          <label className="bw-op-challenge-title-field">Scholarship title
            <input required autoFocus minLength={3} maxLength={160} value={draft.title}
              placeholder="Undergraduate research scholarship" onChange={e => field("title", e.target.value)}/>
          </label>
          <section className="bw-op-challenge-section">
            <h4>Full description</h4>
            <OpportunityDescriptionField value={draft.description} placeholder="Explain the scholarship, its purpose, benefits and who should apply."
              onChange={v => field("description", v)}/>
          </section>
          <ScholarshipCreationFields step={1} details={details} onChange={v => field("details", v)} locked={Boolean(opportunity?.publishedAt)}/>
        </>}
        {step === 2 && <ScholarshipCreationFields step={2} details={details} onChange={v => field("details", v)} locked={Boolean(opportunity?.publishedAt)}/>}
        {step === 3 && <>
          <section className="bw-op-challenge-section">
            <h4>Study mode and destination</h4>
            <div className="bw-op-field-row">
              <label>Study mode<select value={draft.workMode} onChange={e => field("workMode", e.target.value)}>
                <option value="IN_PERSON">In person</option><option value="REMOTE">Remote / Online</option><option value="HYBRID">Hybrid</option>
              </select></label>
              <label>Study destination<input required minLength={2} maxLength={180}
                value={draft.location} placeholder="University, country or Worldwide" onChange={e => field("location", e.target.value)}/></label>
            </div>
          </section>
          <ScholarshipCreationFields step={3} details={details} onChange={v => field("details", v)} locked={Boolean(opportunity?.publishedAt)}/>
        </>}
        {step === 4 && <>
          <ScholarshipCreationFields step={4} details={details} onChange={v => field("details", v)} locked={Boolean(opportunity?.publishedAt)}/>
          {questions}
        </>}
        {step === 5 && <>
          <ScholarshipCreationFields step={5} details={details} onChange={v => field("details", v)}/>
          <section className="bw-op-challenge-section">
            <h4>Application deadline</h4>
            <OpportunityDateTimePicker label="Application deadline (selected timezone)" value={draft.deadline} onChange={v => field("deadline", v)}/>
          </section>
        </>}
        {step === 6 && <ScholarshipCreationFields step={6} details={details} onChange={v => field("details", v)}/>}
        {step === 7 && <Review draft={draft}/>}
      </> : <JobVacancySteps draft={draft} field={field} step={step} questions={questions} locked={Boolean(opportunity?.publishedAt)}/>}
      <p className="bw-op-challenge-native"><NavigationIcon name="security" size={18}/>
        All applicant documents and screening answers are handled privately within BrightWay.</p>
    </div>
  </div>;
}
