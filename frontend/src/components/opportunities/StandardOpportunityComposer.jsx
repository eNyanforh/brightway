import { useState } from "react";
import "./dedicated-opportunity-fields.css";
import DedicatedOpportunityFields from "./DedicatedOpportunityFields";
import { OPPORTUNITY_TYPES, JOB_TYPES, JOB_COMPENSATION_TYPES, JOB_SALARY_PERIODS } from "../../../../shared/opportunities.mjs";
import { opportunitiesApi as api } from "../../api/opportunities";
import NavigationIcon from "../layout/NavigationIcon";
import OpportunityDateTimePicker from "./OpportunityDateTimePicker";
import OpportunityDescriptionField from "./OpportunityDescriptionField";

const copy = {
  JOB: {
    placeholder: "e.g. Junior software engineer",
    description: "Explain the role, responsibilities, eligibility, and hiring process.",
    location: "Where will the successful applicant work?",
    audience: "Recruit talent",
  },
  SCHOLARSHIP: {
    placeholder: "e.g. Undergraduate research scholarship",
    description: "Explain eligibility, funding, selection criteria, and application requirements.",
    location: "Eligible location or institution",
    audience: "Fund learning",
  },
  EVENT: {
    placeholder: "e.g. Career development workshop",
    description: "Explain the purpose, schedule, audience, and participation details.",
    location: "Event venue or location",
    audience: "Bring people together",
  },
};

/* Job, Scholarship and Event creation share the Challenge composer's two
   columns, while retaining their own native application fields. */
export default function StandardOpportunityComposer({
  draft, field, questions, locked, uploading, upload, opportunity,
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const type = OPPORTUNITY_TYPES[draft.type];
  const labels = copy[draft.type];
  if (!type || !labels) return null;
  const coverUrl = draft.coverAssetId ? api.challengeAssetUrl(draft.coverAssetId) : null;

  return <div className="bw-op-challenge-composer bw-op-standard-composer">
    <button type="button" className="bw-op-creation-preview-toggle"
      aria-controls="bw-op-standard-preview" aria-expanded={previewOpen}
      onClick={() => setPreviewOpen(current => !current)}>
      <NavigationIcon name="eye" size={17}/>{previewOpen ? "Hide preview & cover photo" : "Preview & cover photo"}
    </button>
    <aside id="bw-op-standard-preview" aria-label="Live listing preview"
      className={"bw-op-challenge-cover-column bw-op-creation-preview" + (previewOpen ? " is-mobile-open" : "")}>
      <div className="bw-op-creation-preview-heading"><strong>LIVE PREVIEW</strong><span>Updates as you type</span></div>
      <div className="bw-op-creation-preview-card">
      <div className="bw-op-challenge-cover-stage bw-op-standard-preview-stage"
        aria-label={type.label + " cover preview"}>
        {coverUrl ? <img src={coverUrl} alt={type.label + " cover photo preview"} /> :
          <div className="bw-op-standard-poster">
            <span className="bw-op-standard-poster-symbol">
              <NavigationIcon name={type.icon} size={30} />
            </span>
            <span className="bw-op-standard-poster-kind">{type.label}</span>
            <strong>{draft.title.trim() || "Your " + type.label.toLowerCase() + " title"}</strong>
            <small>{labels.audience}</small>
          </div>}
      </div>
      <div className="bw-op-creation-listing">
        <span className="bw-op-creation-listing-type">{type.label.toUpperCase()}</span>
        <h4>{draft.title?.trim() || "Your " + type.label.toLowerCase() + " title"}</h4>
        <p>{draft.description?.trim()
          ? draft.description.trim().slice(0, 170) + (draft.description.trim().length > 170 ? "…" : "")
          : "Your description will appear here as you write."}</p>
        <div className="bw-op-creation-preview-tags">
          <span>{draft.workMode.replaceAll("_", " ").toLowerCase()}</span>
          {draft.location && <span>{draft.location}</span>}
        </div>
      </div>
      </div>
      <div className="bw-op-challenge-cover-tools">
        <label className="bw-op-wizard-upload">
          {uploading === "COVER" ? "Uploading…" : coverUrl ? "Change cover" : "Upload cover"}
          <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Opportunity cover photo"
            disabled={locked || uploading === "COVER"}
            onChange={e => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) upload("COVER", file);
            }} />
        </label>
        {coverUrl && <button type="button" className="bw-op-text-button" disabled={locked}
          onClick={() => field("coverAssetId", null)}>Remove image</button>}
      </div>
      <p className="bw-op-challenge-cover-help">
        Optional 16:9 cover photo (1280 × 720 px or larger recommended) · JPEG, PNG or WebP · Up to 5 MB.
      </p>
    </aside>
    <div className="bw-op-challenge-main bw-op-standard-main">
      <div className="bw-op-challenge-heading">
        <span className="bw-op-challenge-eyebrow">{type.label.toUpperCase()} · BRIGHTWAY</span>
        <span className="bw-op-challenge-audience"><NavigationIcon name="globe" size={15} /> Discoverable on BrightWay</span>
      </div>
      <h3 id="bw-op-step-heading" tabIndex={-1}>
        {opportunity ? "Edit" : "Create"} your {type.label}
      </h3>
      <label className="bw-op-challenge-title-field">Title
        <input required autoFocus minLength={3} maxLength={160}
          value={draft.title} placeholder={labels.placeholder}
          onChange={e => field("title", e.target.value)} />
      </label>
      <section className="bw-op-challenge-section" aria-labelledby="bw-standard-description">
        <h4 id="bw-standard-description">About the {type.label.toLowerCase()}</h4>
        <OpportunityDescriptionField value={draft.description} placeholder={labels.description}
          onChange={value => field("description", value)} />
      </section>
      <section className="bw-op-challenge-section" aria-labelledby="bw-standard-details">
        <h4 id="bw-standard-details">{type.label} details</h4>
        <div className="bw-op-field-row">
          <label>Format
            <select value={draft.workMode} onChange={e => field("workMode", e.target.value)}>
              <option value="IN_PERSON">In person</option>
              <option value="REMOTE">Remote</option>
              <option value="HYBRID">Hybrid</option>
            </select>
          </label>
          <label>Location
            <input required minLength={2} maxLength={180} value={draft.location}
              placeholder={labels.location} onChange={e => field("location", e.target.value)} />
          </label>
        </div>
      </section>
      {draft.type === "JOB" && <section className="bw-op-challenge-section" aria-labelledby="bw-job-details">
        <h4 id="bw-job-details">Employment and compensation</h4>
        <div className="bw-op-field-row">
          <label>Job type
            <select required value={draft.jobDetails?.type || ""}
              onChange={e => field("jobDetails", { ...draft.jobDetails, type: e.target.value,
                compensationType: draft.jobDetails?.compensationType || "PAID",
                salaryMin: draft.jobDetails?.salaryMin ?? null, salaryMax: draft.jobDetails?.salaryMax ?? null,
                salaryCurrency: draft.jobDetails?.salaryCurrency || null,
                salaryPeriod: draft.jobDetails?.salaryPeriod || null })}>
              <option value="">Select job type</option>
              {Object.entries(JOB_TYPES).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
          <label>Compensation
            <select required value={draft.jobDetails?.compensationType || ""}
              onChange={e => field("jobDetails", { ...draft.jobDetails,
                type: draft.jobDetails?.type || "",
                compensationType: e.target.value,
                salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null })}>
              <option value="">Select compensation</option>
              {Object.entries(JOB_COMPENSATION_TYPES).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
        </div>
        {["PAID", "STIPEND"].includes(draft.jobDetails?.compensationType) && <>
          <p>Salary range is optional. Enter both amounts when the employer discloses pay.</p>
          <div className="bw-op-field-row">
            {["salaryMin", "salaryMax"].map((key, index) => <label key={key}>{index ? "Maximum salary" : "Minimum salary"}
              <input type="number" min="0" max="1000000000" step="0.01"
                value={draft.jobDetails?.[key] ?? ""}
                onChange={e => field("jobDetails", { ...draft.jobDetails, [key]: e.target.value === "" ? null : Number(e.target.value) })} />
            </label>)}
          </div>
          <div className="bw-op-field-row">
            <label>Currency
              <select value={draft.jobDetails?.salaryCurrency || ""}
                onChange={e => field("jobDetails", { ...draft.jobDetails, salaryCurrency: e.target.value || null })}>
                <option value="">Select currency</option>
                {["USD", "LRD", "EUR", "GBP"].map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label>Pay period
              <select value={draft.jobDetails?.salaryPeriod || ""}
                onChange={e => field("jobDetails", { ...draft.jobDetails, salaryPeriod: e.target.value || null })}>
                <option value="">Select period</option>
                {Object.entries(JOB_SALARY_PERIODS).map(([value, label]) => <option key={value} value={value}>Per {label}</option>)}
              </select>
            </label>
          </div>
        </>}
      </section>}
      {["JOB", "SCHOLARSHIP"].includes(draft.type) && <DedicatedOpportunityFields type={draft.type}
        details={draft.details} onChange={value => field("details", value)} />}
      <section className="bw-op-challenge-section" aria-labelledby="bw-standard-deadline">
        <h4 id="bw-standard-deadline">{draft.type === "EVENT" ? "Registration deadline" : "Application deadline"}</h4>
        <OpportunityDateTimePicker value={draft.deadline}
          onChange={value => field("deadline", value)} />
      </section>
      <section className="bw-op-challenge-section bw-op-challenge-questions">
        {questions}
      </section>
      <p className="bw-op-challenge-native">
        <NavigationIcon name="security" size={18} />
        Applications are submitted on BrightWay. Save your draft here, then publish it from the organization workspace.
      </p>
    </div>
  </div>;
}
