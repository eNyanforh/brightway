import { OPPORTUNITY_TYPES } from "../../../../shared/opportunities.mjs";
import { opportunitiesApi as api } from "../../api/opportunities";
import NavigationIcon from "../layout/NavigationIcon";

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
        <label>Description
          <textarea required rows={5} minLength={30} maxLength={12000}
            value={draft.description} placeholder={labels.description}
            onChange={e => field("description", e.target.value)} />
        </label>
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
      <section className="bw-op-challenge-section" aria-labelledby="bw-standard-deadline">
        <h4 id="bw-standard-deadline">{draft.type === "EVENT" ? "Registration deadline" : "Application deadline"}</h4>
        <label>Deadline (your local time)
          <input required type="datetime-local" value={draft.deadline}
            onChange={e => field("deadline", e.target.value)} />
        </label>
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
