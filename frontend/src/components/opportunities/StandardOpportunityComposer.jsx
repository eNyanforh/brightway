import { OPPORTUNITY_TYPES, JOB_EMPLOYMENT_TYPES, JOB_COMPENSATION_TYPES, JOB_PAY_PERIODS, JOB_SALARY_CURRENCIES } from "../../../../shared/opportunities.mjs";
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
  const type = OPPORTUNITY_TYPES[draft.type];
  const labels = copy[draft.type];
  if (!type || !labels) return null;
  const coverUrl = draft.coverAssetId ? api.challengeAssetUrl(draft.coverAssetId) : null;
  const isJob = draft.type === "JOB";
  const job = draft.jobDetails || {};
  const updateJob = (key, value) => field("jobDetails", { ...job, [key]: value });

  return <div className="bw-op-challenge-composer bw-op-standard-composer">
    <aside className="bw-op-challenge-cover-column" aria-label={type.label + " cover"}>
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
        Optional cover photo · JPEG, PNG or WebP · Up to 5 MB. Uploaded covers appear on your opportunity cards.
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
      {isJob && <section className="bw-op-challenge-section bw-op-job-details" aria-labelledby="bw-standard-job-terms">
        <h4 id="bw-standard-job-terms">Employment & compensation</h4>
        <div className="bw-op-field-row">
          <label>Job type
            <select value={job.employmentType || "FULL_TIME"} onChange={e => updateJob("employmentType", e.target.value)}>
              {Object.entries(JOB_EMPLOYMENT_TYPES).map(([value, label]) =>
                <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>Compensation
            <select value={job.compensation || "PAID"} onChange={e => field("jobDetails", {
              ...job, compensation: e.target.value,
              salaryMin: e.target.value === "UNPAID" ? null : job.salaryMin,
              salaryMax: e.target.value === "UNPAID" ? null : job.salaryMax,
            })}>
              {Object.entries(JOB_COMPENSATION_TYPES).map(([value, label]) =>
                <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        {job.compensation !== "UNPAID" ? <>
          <div className="bw-op-field-row">
            <label>Minimum salary
              <input type="number" min="0.01" max="1000000000" step="0.01" required
                value={job.salaryMin ?? ""} placeholder="e.g. 500"
                onChange={e => updateJob("salaryMin", e.target.value === "" ? null : Number(e.target.value))} />
            </label>
            <label>Maximum salary
              <input type="number" min="0.01" max="1000000000" step="0.01" required
                value={job.salaryMax ?? ""} placeholder="e.g. 1000"
                onChange={e => updateJob("salaryMax", e.target.value === "" ? null : Number(e.target.value))} />
            </label>
          </div>
          <div className="bw-op-field-row">
            <label>Currency
              <select value={job.currency || "USD"} onChange={e => updateJob("currency", e.target.value)}>
                {Object.entries(JOB_SALARY_CURRENCIES).map(([value, symbol]) =>
                  <option key={value} value={value}>{value} ({symbol})</option>)}
              </select>
            </label>
            <label>Pay period
              <select value={job.payPeriod || "MONTH"} onChange={e => updateJob("payPeriod", e.target.value)}>
                {Object.entries(JOB_PAY_PERIODS).map(([value, label]) =>
                  <option key={value} value={value}>{label === "one-time" ? "One-time" : "Per " + label}</option>)}
              </select>
            </label>
          </div>
          <p className="bw-op-job-pay-help">Enter the actual offered range, using the same currency and pay period for both amounts.</p>
        </> : <p className="bw-op-job-pay-help">This role is unpaid. No salary range will appear on the listing.</p>}
      </section>}
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
