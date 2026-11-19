import { useState } from "react";
import NavigationIcon from "../layout/NavigationIcon";
import OpportunityDateTimePicker from "./OpportunityDateTimePicker";
import OpportunityDescriptionField from "./OpportunityDescriptionField";
import OpportunityCategoryIcon from "./OpportunityCategoryIcon";
import { opportunitiesApi as api } from "../../api/opportunities";
import {
  CHALLENGE_TOPIC_OPTIONS, MAX_CHALLENGE_TOPICS, MAX_CHALLENGE_PRIZES,
  newChallengePrize,
} from "../../../../shared/challenges.mjs";
import ChallengePrizeFields from "./ChallengePrizeFields";
import ChallengeCollaboratorPicker from "./ChallengeCollaboratorPicker";
import ChallengePostTypes from "./ChallengePostTypes";
import "./challenge-composer.css";

// Single-page, native BrightWay Challenge publishing. Other opportunity
// types continue using the existing step-by-step editor.
export default function ChallengeComposer({
  draft, field, organizationId, collaborators, setCollaborators, questions,
  locked, lockedForm, uploading, upload,
}) {
  const hasCover = Boolean(draft.coverAssetId);
  const [previewOpen, setPreviewOpen] = useState(false);
  return <div className="bw-op-challenge-composer">
    <button type="button" className="bw-op-creation-preview-toggle"
      aria-controls="bw-op-challenge-preview" aria-expanded={previewOpen}
      onClick={() => setPreviewOpen(current => !current)}>
      <NavigationIcon name="eye" size={17}/>{previewOpen ? "Hide listing preview" : "Preview listing"}
    </button>
    <aside id="bw-op-challenge-preview" aria-label="Live listing preview"
      className={"bw-op-challenge-cover-column bw-op-creation-preview" + (previewOpen ? " is-mobile-open" : "")}>
      <div className="bw-op-creation-preview-heading"><strong>LIVE PREVIEW</strong><span>Updates as you type</span></div>
      <div className="bw-op-creation-preview-card">
      <div className="bw-op-challenge-cover-stage" aria-label="Challenge cover preview">
        {hasCover
          ? <img alt="Challenge cover photo preview"
              src={api.challengeAssetUrl(draft.coverAssetId)} />
          : <div className="bw-op-challenge-cover-placeholder">
              <NavigationIcon name="image" size={36} />
              <strong>Your Challenge cover</strong>
              <span>Upload your own image</span>
            </div>}
      </div>
      <div className="bw-op-creation-listing">
        <span className="bw-op-creation-listing-type">CHALLENGE</span>
        <h4>{draft.title?.trim() || "Your challenge title"}</h4>
        <p>{draft.description?.trim()
          ? draft.description.trim().slice(0, 170) + (draft.description.trim().length > 170 ? "…" : "")
          : "Your description will appear here as you write."}</p>
        <div className="bw-op-creation-preview-tags">
          <span>{draft.deadline ? "Deadline: " + new Date(draft.deadline).toLocaleDateString("en-GB") : "Deadline not set"}</span>
        </div>
      </div>
      </div>
      <div className="bw-op-challenge-cover-tools">
        <label className="bw-op-wizard-upload">
          {uploading === "COVER" ? "Uploading…" : hasCover ? "Change cover" : "Upload cover"}
          <input type="file" accept="image/jpeg,image/png,image/webp"
            aria-label="Challenge cover photo" disabled={locked || uploading === "COVER"}
            onChange={e => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) upload("COVER", file);
            }} />
        </label>
        {hasCover && <button type="button" className="bw-op-text-button"
          disabled={locked} onClick={() => field("coverAssetId", null)}>Remove image</button>}
      </div>
      <p className="bw-op-challenge-cover-help">Recommended 16:9 landscape (1280 × 720 px or larger) · JPEG, PNG or WebP · Up to 5 MB.</p>
    </aside>
    <div className="bw-op-challenge-main">
      <h3 id="bw-op-step-heading" tabIndex={-1}>Create your Challenge</h3>
      <label className="bw-op-challenge-title-field">Challenge Title
        <input required autoFocus minLength={3} maxLength={160} value={draft.title}
          placeholder="Name your challenge" onChange={e => field("title", e.target.value)} />
      </label>
      <section className="bw-op-challenge-section" aria-labelledby="bw-op-challenge-description-heading">
        <h4 id="bw-op-challenge-description-heading">About the challenge</h4>
        <OpportunityDescriptionField value={draft.description} rows={5}
          placeholder="Explain the goal, rules, judging criteria, and what participants must submit."
          onChange={value => field("description", value)} />
      </section>
      <section className="bw-op-challenge-section" aria-labelledby="bw-op-challenge-deadline-heading">
        <h4 id="bw-op-challenge-deadline-heading">Deadline</h4>
        <OpportunityDateTimePicker value={draft.deadline}
          onChange={value => field("deadline", value)} />
      </section>
      <section className="bw-op-challenge-section" aria-labelledby="bw-op-challenge-categories-heading">
        <h4 id="bw-op-challenge-categories-heading">Categories</h4>
        <fieldset className="bw-op-challenge-topics" aria-label="Challenge categories">
          <legend>Choose up to {MAX_CHALLENGE_TOPICS} categories</legend>
          <div className="bw-op-challenge-topic-options">{CHALLENGE_TOPIC_OPTIONS.map(topic =>
            <label key={topic} className="bw-op-challenge-topic">
              <input type="checkbox" value={topic} checked={draft.topics.includes(topic)}
                disabled={!draft.topics.includes(topic) && draft.topics.length >= MAX_CHALLENGE_TOPICS}
                onChange={e => field("topics", e.target.checked
                  ? [...draft.topics, topic] : draft.topics.filter(value => value !== topic))} />
              <OpportunityCategoryIcon category={topic} /><span>{topic}</span>
            </label>)}</div>
        </fieldset>
      </section>
      <section className="bw-op-challenge-section" aria-labelledby="bw-op-challenge-prizes-heading">
        <h4 id="bw-op-challenge-prizes-heading">Prizes</h4>
        <p className="bw-op-wizard-help">Choose the reward type and enter details for each prize.</p>
        {draft.prizes.map((prize, index) => <div className="bw-op-wizard-prize" key={index}>
          <div className="bw-op-wizard-prize-heading"><strong>Prize {index + 1}</strong>
            <button type="button" className="bw-op-text-button"
              onClick={() => field("prizes", draft.prizes.filter((_, i) => i !== index))}>
              Remove prize</button></div>
          <ChallengePrizeFields prize={prize} index={index}
            onChange={value => field("prizes", draft.prizes.map((row, i) => i === index ? value : row))} />
        </div>)}
        <button type="button" className="bw-op-secondary" disabled={draft.prizes.length >= MAX_CHALLENGE_PRIZES}
          onClick={() => field("prizes", [...draft.prizes, newChallengePrize("CASH")])}>
          + {draft.prizes.length ? "Add another prize" : "Add Prize"}
        </button>
      </section>
      <section className="bw-op-challenge-section">
        <ChallengeCollaboratorPicker organizationId={organizationId} selected={collaborators}
          disabled={locked} onChange={next => {
            setCollaborators(next);
            field("collaboratorIds", next.map(item => item.organizationId));
          }} />
      </section>
      <section className="bw-op-challenge-section" aria-labelledby="bw-op-challenge-post-types-heading">
        <h4 id="bw-op-challenge-post-types-heading">Post types</h4>
        <ChallengePostTypes requirements={draft.postRequirements}
          onChange={value => field("postRequirements", value)}
          disabled={locked} locked={lockedForm} />
      </section>
      <section className="bw-op-challenge-section bw-op-challenge-questions">{questions}</section>
      <p className="bw-op-challenge-native">
        <NavigationIcon name="security" size={18} />
        Participants apply and submit on BrightWay. Save a draft here, then publish it from your organization workspace.
      </p>
    </div>
  </div>;
}
