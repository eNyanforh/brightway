import { useEffect, useRef, useState } from "react";
import { JOB_TYPES, JOB_COMPENSATION_TYPES, formatJobSalary } from "../../../../shared/opportunities.mjs";
import { opportunitiesApi as api } from "../../api/opportunities";
import NavigationIcon from "../layout/NavigationIcon";
import JobVacancySteps from "./JobVacancySteps";
import "./job-creation-studio.css";

const journey = [
  { name: "Job Details", short: "About the role", description: "Title, description, employment type and workplace" },
  { name: "Pay & Requirements", short: "Pay and criteria", description: "Compensation, qualifications and responsibilities" },
  { name: "Applications", short: "How to apply", description: "Deadline, documents and screening" },
  { name: "Review & Publish", short: "Review and publish", description: "Check the details before going live" },
];
const levels = { NO_EXPERIENCE: "No experience needed", ENTRY: "Entry level", JUNIOR: "Junior", MID: "Mid level", SENIOR: "Senior", MANAGER: "Manager", EXECUTIVE: "Executive" };
const pretty = value => String(value || "").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());
const first = items => Array.isArray(items) && items.length > 0 ? items[0] : "";

export default function JobCreationStudio({
  draft, field, step, onGoStep, questions, locked, uploading, upload, organizationName,
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewTrigger = useRef(null);
  const previewClose = useRef(null);
  const closePreview = () => { setPreviewOpen(false); previewTrigger.current?.focus(); };
  useEffect(() => { if (previewOpen) previewClose.current?.focus(); }, [previewOpen]);
  const data = draft.details || {};
  const job = draft.jobDetails || {};
  const cover = draft.coverAssetId ? api.challengeAssetUrl(draft.coverAssetId) : "";
  const progress = Math.max(1, Math.min(step, 4));
  const title = draft.title.trim() || "Your job title";
  const selectedType = first(data.jobTypes) || job.type;
  const selectedLevel = first(data.experienceLevels) || data.experienceLevel;
  const deadline = draft.deadline && Number.isFinite(Date.parse(draft.deadline))
    ? new Date(draft.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Not set";
  const amount = formatJobSalary(job);
  const coverEditor = step === 1 ? <section className="bw-job-studio-media" aria-label="Job cover settings">
    <div className="bw-job-studio-section-heading">
      <div><span className="bw-job-studio-overline">OPTIONAL</span><h4>Cover photo</h4>
        <p>Add a visual that represents the role or your organization. The listing works without one.</p></div>
    </div>
    <div className="bw-job-studio-media-row">
      <div className="bw-job-studio-media-mini">
        {cover ? <img src={cover} alt="Uploaded cover photo" /> : <NavigationIcon name="image" size={23} />}
      </div>
      <div className="bw-job-studio-media-action">
        <label className="bw-job-studio-upload">{uploading === "COVER" ? "Uploading…" : cover ? "Replace photo" : "Choose photo"}
          <input aria-label="Opportunity cover photo" type="file" accept="image/jpeg,image/png,image/webp"
            disabled={locked || Boolean(uploading)} onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) upload("COVER", file);
            }}/>
        </label>
        {cover && <button type="button" className="bw-job-studio-remove" disabled={locked || Boolean(uploading)}
          onClick={() => field("coverAssetId", null)}>Remove photo</button>}
        <p>16:9 landscape · 1280 × 720 recommended · JPG, PNG or WebP · Up to 5 MB</p>
      </div>
    </div>
  </section> : null;

  return <div className="bw-job-studio" onKeyDown={event => {
    if (event.key === "Escape" && previewOpen) {
      event.preventDefault(); event.stopPropagation(); closePreview();
    }
  }}>
    <aside className="bw-job-studio-journey" aria-label="Job creation navigation">
      <div className="bw-job-studio-journey-label">
        <span className="bw-job-studio-overline">YOUR WORKFLOW</span>
        <h4>Post a vacancy</h4>
        <p>Four focused stages, one complete listing.</p>
      </div>
      <nav aria-label="Job creation steps" className="bw-job-studio-step-nav">
        {journey.map((item, i) => {
          const n = i + 1;
          const current = n === step;
          return <button type="button" key={item.name} disabled={n > step}
            className={"bw-job-studio-step" + (current ? " is-active" : "") + (n < step ? " is-complete" : "")}
            aria-current={current ? "step" : undefined}
            onClick={() => { if (n < step) onGoStep(n); }}>
            <span className="bw-job-studio-step-number" aria-hidden="true">{n < step ? "✓" : n}</span>
            <span><strong>{item.short}</strong><small>{item.description}</small></span>
          </button>;
        })}
      </nav>
      <div className="bw-job-studio-journey-note">
        <NavigationIcon name="security" size={19}/>
        <p>Applications and supporting documents stay on BrightWay.</p>
      </div>
    </aside>

    <main className="bw-job-studio-work">
      <div className="bw-job-studio-stage-header">
        <div className="bw-job-studio-stage-meta">
          <span className="bw-job-studio-overline">JOB VACANCY</span>
          <span className="bw-job-studio-step-count">Step {step} of 4</span>
        </div>
        <div className="bw-job-studio-progress-track" aria-label={step + " of 4 steps"}>
          <div style={{ width: progress * 25 + "%" }}/>
        </div>
        <h3 id="bw-op-step-heading" tabIndex={-1}>{journey[step - 1]?.name || "Job Details"}</h3>
        <p className="bw-job-studio-stage-help">{step === 1 ? "Help candidates understand the opportunity in a few clear details."
          : step === 2 ? "Set expectations clearly so the right candidates can find this role."
          : step === 3 ? "Decide what applicants need to submit and when applications close."
          : "Everything in one place. Check the listing and publish when you are ready."}</p>
        <button type="button" ref={previewTrigger} className="bw-job-studio-preview-toggle" aria-expanded={previewOpen}
          aria-controls="bw-job-studio-preview" onClick={() => setPreviewOpen(open => !open)}>
          <NavigationIcon name="eye" size={18}/>{previewOpen ? "Hide preview" : "Preview job listing"}
        </button>
      </div>
      <div className="bw-job-studio-form">
        <JobVacancySteps draft={draft} field={field} step={step} questions={questions} locked={locked}
          coverEditor={coverEditor} />
      </div>
      <p className="bw-job-studio-privacy">
        <NavigationIcon name="security" size={16}/> Your changes stay in this browser tab until the opportunity is saved.
      </p>
    </main>

    {previewOpen && <button type="button" className="bw-job-studio-preview-backdrop"
      aria-label="Dismiss job preview" onClick={closePreview} />}
    <aside id="bw-job-studio-preview" className={"bw-job-studio-preview" + (previewOpen ? " is-mobile-open" : "")}
      aria-label="Live job listing preview">
      <div className="bw-job-studio-preview-heading">
        <div><span className="bw-job-studio-overline">LIVE PREVIEW</span><h4>Candidate view</h4></div>
        <button type="button" ref={previewClose} className="bw-job-studio-preview-close" aria-label="Close job preview"
          onClick={closePreview}>×</button>
      </div>
      <div className="bw-job-studio-preview-card">
        <div className="bw-job-studio-preview-cover">
          {cover ? <img src={cover} alt="Job cover preview" /> :
            <div className="bw-job-studio-preview-art">
              <span className="bw-job-studio-art-mark"><NavigationIcon name="opportunities" size={27}/></span>
              <span>AN OPPORTUNITY TO GROW</span>
              <strong>BRIGHTWAY</strong>
            </div>}
        </div>
        <div className="bw-job-studio-preview-content">
          <span className="bw-job-studio-category-label">JOB VACANCY</span>
          <h5>{title}</h5>
          <p className="bw-job-studio-preview-org">Your organization</p>
          <div className="bw-job-studio-preview-facts">
            {draft.location && <span><NavigationIcon name="pin" size={14}/>{draft.location}</span>}
            <span><NavigationIcon name="opportunities" size={14}/>{pretty(draft.workMode === "IN_PERSON" ? "On-site" : draft.workMode)}</span>
            {selectedType && <span>{JOB_TYPES[selectedType] || pretty(selectedType)}</span>}
            {selectedLevel && <span>{levels[selectedLevel] || pretty(selectedLevel)}</span>}
          </div>
          <div className="bw-job-studio-preview-excerpt">
            <strong>About this position</strong>
            <p>{draft.description.trim()
              ? draft.description.trim().slice(0, 200) + (draft.description.trim().length > 200 ? "…" : "")
              : "Your job overview will appear here as you complete the form."}</p>
          </div>
          <div className="bw-job-studio-preview-bottom">
            <div><small>Compensation</small><strong>{amount || JOB_COMPENSATION_TYPES[job.compensationType] || "To be confirmed"}</strong></div>
            <div><small>Apply before</small><strong>{deadline}</strong></div>
          </div>
          <div className="bw-job-studio-preview-cta" aria-label="Application button preview">Apply Now <NavigationIcon name="chevron-right" size={15}/></div>
        </div>
      </div>
      <p className="bw-job-studio-preview-footnote">Illustrative listing preview. It updates as you type; nothing is public until you publish.</p>
    </aside>
  </div>;
}
