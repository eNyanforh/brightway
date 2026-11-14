import { useEffect, useRef, useState } from "react";
import { OPPORTUNITY_TYPES, QUESTION_TYPES } from "../../../../shared/opportunities.mjs";
import {
  CHALLENGE_TOPIC_OPTIONS, MAX_CHALLENGE_TOPICS, CHALLENGE_PRIZE_TYPES,
  MAX_CHALLENGE_PRIZES, newChallengePrize, challengePrizeValue,
} from "../../../../shared/challenges.mjs";
import NavigationIcon from "../layout/NavigationIcon";
import ChallengePrizeFields from "./ChallengePrizeFields";
import ChallengeCollaboratorPicker from "./ChallengeCollaboratorPicker";
import { opportunitiesApi as api } from "../../api/opportunities";
import "./challenge-sidebar-card.css";
import "./opportunity-editor-wizard.css";

const choices = [
  ["JOB", "Job", "Recruit talent for a position."],
  ["SCHOLARSHIP", "Scholarship", "Support learners with funding."],
  ["CHALLENGE", "Challenge", "Launch a competition hosted on BrightWay."],
  ["EVENT", "Event", "Invite people to an event."],
];
const blank = () => ({
  type: "", title: "", description: "", location: "", workMode: "IN_PERSON",
  prize: "", prizes: [], collaboratorIds: [], sponsorLogoIds: [], backgroundAssetId: null,
  titleAssetId: null, coverAssetId: null, maxApplicants: null, topics: [],
  deadline: "", questions: [],
});
const toLocal = date => {
  const value = new Date(date);
  return Number.isFinite(value.getTime())
    ? new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    : "";
};
function initialDraft(opportunity) {
  if (!opportunity) return blank();
  const initial = Object.fromEntries(Object.entries(blank()).map(([key, value]) =>
    [key, opportunity[key] ?? value]));
  if (opportunity.type === "CHALLENGE" && !initial.prizes.length && opportunity.prize) {
    initial.prizes = [{ type: "OTHER", description: opportunity.prize }];
  }
  return { ...initial,
    ...(opportunity.coverImage ? { coverImage: opportunity.coverImage } : {}),
    collaboratorIds: (opportunity.collaborators || []).map(item => item.organizationId),
    deadline: toLocal(opportunity.deadline),
  };
}
function PhotoField({ label, kind, assetId, disabled, busy, onFile, onRemove }) {
  return <div className="bw-op-wizard-photo-field">
    <div className="bw-op-wizard-photo-label"><strong>{label}</strong><span>Landscape JPEG, PNG or WebP · At least 700 × 240 px · Up to 5 MB</span></div>
    <div className="bw-op-wizard-photo-row">
      <div className="bw-op-wizard-photo-thumb">
        {assetId ? <img alt={label + " preview"} src={api.challengeAssetUrl(assetId)} /> : <NavigationIcon name="image" size={24} />}
      </div>
      <div className="bw-op-wizard-photo-controls">
        <label className="bw-op-wizard-upload">
          {busy ? "Uploading…" : assetId ? "Replace image" : "Upload image"}
          <input type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled || busy}
            aria-label={label} onChange={e => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) onFile(kind, file);
            }} />
        </label>
        {assetId && <button type="button" className="bw-op-text-button" disabled={disabled || busy} onClick={onRemove}>Remove image</button>}
      </div>
    </div>
  </div>;
}
function QuestionBuilder({ draft, field, changeQuestion, lockedForm, busy }) {
  return <section className="bw-op-form-builder">
    <h3>Application questions</h3>
    <p>{lockedForm
      ? "Questions are locked after the Challenge or opportunity has been published."
      : "Optional questions are answered and stored privately on BrightWay. No external application forms."}</p>
    {draft.questions.map((q, i) => <fieldset key={q.id} className="bw-op-builder-question" disabled={lockedForm || busy}>
      <legend>Question {i + 1}</legend>
      <label>Question text<input aria-label={`Question ${i + 1} text`} required minLength={3} maxLength={300}
        value={q.label} onChange={e => changeQuestion(i, { label: e.target.value })} /></label>
      <div className="bw-op-field-row">
        <label>Answer type<select aria-label={`Question ${i + 1} type`} value={q.type}
          onChange={e => changeQuestion(i, { type: e.target.value, options: [] })}>
          {Object.entries(QUESTION_TYPES).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
        </select></label>
        <label className="bw-op-checkbox"><input type="checkbox" checked={q.required}
          onChange={e => changeQuestion(i, { required: e.target.checked })} />Required</label>
      </div>
      {["SINGLE_CHOICE", "MULTIPLE_CHOICE"].includes(q.type) && <label>
        Choices (one per line, 2–12)<textarea aria-label={`Question ${i + 1} choices`} rows={3} required
          value={q.options.join("\n")} onChange={e => changeQuestion(i, { options: e.target.value.split("\n") })} />
      </label>}
      {!lockedForm && <button type="button" className="bw-op-text-button" onClick={() =>
        field("questions", draft.questions.filter((_, index) => index !== i))}>Remove question {i + 1}</button>}
    </fieldset>)}
    {!lockedForm && <button className="bw-op-secondary" type="button" disabled={busy || draft.questions.length >= 20}
      onClick={() => field("questions", [...draft.questions, {
        id: crypto.randomUUID(), label: "", type: "SHORT_ANSWER", required: true, options: [],
      }])}>+ Add question</button>}
  </section>;
}

export default function OpportunityEditor({ organizationId, opportunity, onSaved, onClose }) {
  const [draft, setDraft] = useState(() => initialDraft(opportunity));
  const [collaborators, setCollaborators] = useState(() =>
    (opportunity?.collaborators || []).map(item => ({
      organizationId: item.organizationId, organization: item.organization, state: item.state,
    })));
  const [step, setStep] = useState(0), [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(""), [error, setError] = useState(null);
  const requestKey = useRef(crypto.randomUUID()), request = useRef(null);
  const uploadController = useRef(null), lock = useRef(false), dialog = useRef(null);
  const lockedForm = Boolean(opportunity?.publishedAt);
  const challenge = draft.type === "CHALLENGE";
  const steps = challenge
    ? ["Opportunity type", "Challenge details", "Prizes & collaborators", "Cover photo", "Applications", "Review"]
    : ["Opportunity type", "Opportunity details", "Applications", "Review"];
  const last = steps.length - 1;

  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.focus();
    return () => { request.current?.abort(); uploadController.current?.abort(); previous?.focus(); };
  }, []);
  useEffect(() => { if (step > 0) dialog.current?.querySelector("#bw-op-step-heading")?.focus(); }, [step]);
  function field(key, value) { setDraft(old => ({ ...old, [key]: value })); }
  function changeQuestion(index, changes) {
    setDraft(old => ({ ...old, questions: old.questions.map((question, i) =>
      i === index ? { ...question, ...changes } : question) }));
  }
  function close() {
    if (!busy && !uploading && window.confirm("Close this editor and discard unsaved changes?")) onClose();
  }
  function changeType(type) {
    if (lockedForm) return;
    setDraft(old => ({
      ...old, type,
      ...(type === "CHALLENGE"
        ? { location: "BrightWay", workMode: "REMOTE" }
        : old.type === "CHALLENGE" ? { location: "", workMode: "IN_PERSON" } : {}),
    }));
    setError(null);
  }

  async function upload(kind, file) {
    if (uploading || busy) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) {
      setError(new Error("Choose a JPEG, PNG or WebP image up to 5 MB.")); return;
    }
    const controller = new AbortController(); uploadController.current = controller;
    setUploading(kind); setError(null);
    try {
      const asset = await api.uploadChallengeAsset(organizationId, kind, file, controller.signal);
      if (!controller.signal.aborted) {
        setDraft(old => ({ ...old, coverAssetId: asset.id }));
      }
    } catch (cause) { if (!controller.signal.aborted) setError(cause); }
    finally { if (!controller.signal.aborted) setUploading(""); }
  }
  function validateStep() {
    if (step === 0 && !draft.type) return "Choose which opportunity you want to offer.";
    if (challenge && steps[step] === "Cover photo" && !draft.coverAssetId &&
        !opportunity?.backgroundAssetId && !opportunity?.titleAssetId)
      return "Upload a Challenge cover photo to continue.";
    if (steps[step]?.endsWith("Applications")) {
      if (!draft.deadline || !Number.isFinite(new Date(draft.deadline).getTime()) ||
          new Date(draft.deadline).getTime() <= Date.now()) return "Choose a future deadline.";
      if (draft.questions.some(q => ["SINGLE_CHOICE", "MULTIPLE_CHOICE"].includes(q.type) &&
          (q.options.length < 2 || q.options.length > 12 ||
            q.options.some(option => !option.trim())))) return "Choice questions need 2–12 choices.";
    }
    return null;
  }
  async function submit(e) {
    e.preventDefault();
    if (lock.current || uploading) return;
    setError(null);
    const problem = validateStep();
    if (problem) { setError(new Error(problem)); return; }
    if (step < last) { setStep(current => current + 1); return; }
    if (!draft.type || draft.title.trim().length < 3 || draft.description.trim().length < 30 ||
        !draft.deadline || !Number.isFinite(new Date(draft.deadline).getTime()) ||
        new Date(draft.deadline).getTime() <= Date.now()) {
      setError(new Error("Check the required details and future deadline before saving.")); return;
    }
    lock.current = true; setBusy(true);
    const controller = new AbortController(); request.current = controller;
    try {
      const body = {
        ...draft,
        location: challenge ? "BrightWay" : draft.location,
        workMode: challenge ? "REMOTE" : draft.workMode,
        // The structured prizes are canonical. Removing every prize must not
        // silently restore a legacy reward from a previous save.
        prize: "",
        prizes: challenge ? draft.prizes : [],
        collaboratorIds: challenge ? draft.collaboratorIds : [],
        sponsorLogoIds: challenge ? draft.sponsorLogoIds : [],
        backgroundAssetId: challenge ? draft.backgroundAssetId : null,
        titleAssetId: challenge ? draft.titleAssetId : null,
        coverAssetId: challenge ? draft.coverAssetId : null,
        maxApplicants: challenge ? draft.maxApplicants : null,
        deadline: new Date(draft.deadline).toISOString(),
      };
      const saved = opportunity
        ? await api.edit(organizationId, opportunity.id,
          { ...body, expectedVersion: opportunity.version }, controller.signal)
        : await api.create(organizationId, { ...body, requestKey: requestKey.current }, controller.signal);
      if (!controller.signal.aborted) onSaved(saved);
    } catch (cause) { if (!controller.signal.aborted) setError(cause); }
    finally { if (!controller.signal.aborted) { lock.current = false; setBusy(false); } }
  }
  const stepName = steps[step];
  const selectedType = OPPORTUNITY_TYPES[draft.type];
  const imageUrl = id => id ? api.challengeAssetUrl(id) : null;

  const locked = busy || Boolean(uploading) || error?.status === 409 ||
    [401, 403, 404].includes(error?.status);

  return <div className="bw-op-overlay bw-op-wizard-overlay" onKeyDown={e => {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    if (e.key === "Tab" && dialog.current) {
      const nodes = [...dialog.current.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary'
      )].filter(node => node.offsetParent !== null);
      const first = nodes[0], lastNode = nodes.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastNode?.focus(); }
      else if (!e.shiftKey && document.activeElement === lastNode) { e.preventDefault(); first?.focus(); }
    }
  }}>
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true"
      aria-labelledby="op-editor-title" className="bw-op-editor bw-op-wizard">
      <header className="bw-op-wizard-header">
        <div><p className="bw-op-wizard-kicker">{opportunity ? "EDIT OPPORTUNITY" : "CREATE OPPORTUNITY"}</p>
          <h2 id="op-editor-title">{opportunity ? "Edit your opportunity" : "Create an opportunity"}</h2>
          <p>Step {step + 1} of {steps.length}</p>
        </div>
        <button aria-label="Close editor" type="button" disabled={busy || Boolean(uploading)} onClick={close}>×</button>
      </header>
      <nav className="bw-op-wizard-progress" aria-label="Creation progress">
        {steps.map((label, index) => <span key={label} className={index === step ? "is-current" : index < step ? "is-complete" : ""}
          aria-current={index === step ? "step" : undefined}><span>{index + 1}</span>{label}</span>)}
      </nav>
      <form onSubmit={submit}>
        {error && <div className="bw-op-wizard-error" role="alert">{error.message}</div>}
        <fieldset className="bw-op-editor-fields bw-op-wizard-fields" disabled={locked}>
          <div className="bw-op-wizard-step">
            <h3 id="bw-op-step-heading" tabIndex={-1}>{step === 0 ? "What opportunity do you want to offer?" : stepName}</h3>
            {step === 0 && <>
              <p className="bw-op-wizard-help">Select an opportunity type to get the right publishing form.</p>
              <div className="bw-op-wizard-types" role="radiogroup" aria-label="Opportunity type">
                {choices.map(([type, title, help]) => <button key={type} type="button"
                  role="radio" aria-checked={draft.type === type} disabled={lockedForm}
                  className={"bw-op-wizard-type" + (draft.type === type ? " is-selected" : "")}
                  onClick={() => changeType(type)}>
                  <span className="bw-op-wizard-type-icon"><NavigationIcon name={OPPORTUNITY_TYPES[type].icon} size={22} /></span>
                  <strong>{title}</strong><span>{help}</span>
                </button>)}
              </div>
              {challenge && <p className="bw-op-wizard-native"><NavigationIcon name="security" size={18} />
                Every Challenge takes place on BrightWay. Participants apply and submit their work here.</p>}
            </>}

            {stepName.endsWith("details") && step !== 0 && <>
              <label>{challenge ? "Challenge Title" : "Title"}
                <input required autoFocus minLength={3} maxLength={160} value={draft.title}
                  onChange={e => field("title", e.target.value)}
                  placeholder={challenge ? "Give your challenge a clear title" : "A clear title for your opportunity"} /></label>
              <label>Description<textarea required rows={6} minLength={30} maxLength={12000}
                value={draft.description} onChange={e => field("description", e.target.value)}
                placeholder={challenge ? "Explain the goal, rules, judging criteria, and what participants must submit on BrightWay." : "Describe eligibility, benefits and the selection process."} /></label>
              {challenge ? <>
                <fieldset className="bw-op-challenge-topics" aria-label="Challenge categories">
                  <legend>Categories (choose up to {MAX_CHALLENGE_TOPICS})</legend>
                  <div className="bw-op-challenge-topic-options">{CHALLENGE_TOPIC_OPTIONS.map(topic =>
                    <label key={topic} className="bw-op-challenge-topic">
                      <input type="checkbox" value={topic} checked={draft.topics.includes(topic)}
                        disabled={!draft.topics.includes(topic) && draft.topics.length >= MAX_CHALLENGE_TOPICS}
                        onChange={e => field("topics", e.target.checked
                          ? [...draft.topics, topic] : draft.topics.filter(value => value !== topic))} />
                      <span>{topic}</span>
                    </label>)}</div>
                </fieldset>
                <p className="bw-op-wizard-native"><NavigationIcon name="security" size={18} />
                  Participation is hosted exclusively on BrightWay. No external links or offline application method.</p>
              </> : <>
                <div className="bw-op-field-row">
                  <label>Format<select value={draft.workMode} onChange={e => field("workMode", e.target.value)}>
                    <option value="IN_PERSON">In person</option><option value="REMOTE">Remote</option><option value="HYBRID">Hybrid</option>
                  </select></label>
                  <label>Location<input required minLength={2} maxLength={180} value={draft.location}
                    onChange={e => field("location", e.target.value)} placeholder="Monrovia, Liberia or worldwide" /></label>
                </div>
              </>}
            </>}

            {challenge && stepName === "Prizes & collaborators" && <>
              <p className="bw-op-wizard-help">Add rewards and invite other BrightWay organizations to co-host this challenge.</p>
              {draft.prizes.map((prize, index) => <div className="bw-op-wizard-prize" key={index}>
                <div className="bw-op-wizard-prize-heading"><strong>Prize {index + 1}</strong>
                  <button type="button" className="bw-op-text-button"
                    onClick={() => field("prizes", draft.prizes.filter((_, i) => i !== index))}>Remove prize</button></div>
                <ChallengePrizeFields prize={prize} index={index}
                  onChange={value => field("prizes", draft.prizes.map((row, i) => i === index ? value : row))} />
              </div>)}
              <button type="button" className="bw-op-secondary" disabled={draft.prizes.length >= MAX_CHALLENGE_PRIZES}
                onClick={() => field("prizes", [...draft.prizes, newChallengePrize("CASH")])}>
                + {draft.prizes.length ? "Add another prize" : "Add Prize"}</button>
              <ChallengeCollaboratorPicker organizationId={organizationId} selected={collaborators}
                disabled={busy || Boolean(uploading)}
                onChange={next => {
                  setCollaborators(next);
                  field("collaboratorIds", next.map(item => item.organizationId));
                }} />
            </>}
            {challenge && stepName === "Cover photo" && <>
              <p className="bw-op-wizard-help">Upload one original cover photo for the Challenge. No suggested or stock photos are shown.</p>
              <PhotoField label="Challenge cover photo" kind="COVER" assetId={draft.coverAssetId}
                disabled={locked} busy={uploading === "COVER"} onFile={upload}
                onRemove={() => field("coverAssetId", null)} />
            </>}

            {stepName === "Applications" && <>
              <div className="bw-op-field-row">
                <label>Deadline (your local time)<input required type="datetime-local" value={draft.deadline}
                  onChange={e => field("deadline", e.target.value)} /></label>
                {challenge ? <label>Number of Applicants (maximum)
                  <input type="number" min={1} max={1000000} step={1} value={draft.maxApplicants ?? ""}
                    placeholder="Leave empty for unlimited" onChange={e => field("maxApplicants",
                      e.target.value === "" ? null : Number(e.target.value))} />
                </label> : <div />}
              </div>
              {challenge && <p className="bw-op-wizard-help">The applicant limit is enforced on BrightWay. If left empty, submissions are unlimited until the deadline.</p>}
              <QuestionBuilder draft={draft} field={field} changeQuestion={changeQuestion}
                lockedForm={lockedForm} busy={busy} />
              {challenge && <p className="bw-op-wizard-native"><NavigationIcon name="security" size={18} />
                All entries and attachments stay on BrightWay; no off-platform or offline submissions.</p>}
            </>}

            {stepName === "Review" && <>
              <p className="bw-op-wizard-help">Review your listing before saving a draft. You can publish it from the Opportunities dashboard.</p>
              <div className="bw-op-wizard-review">
                {challenge && draft.coverAssetId && <div className="bw-op-wizard-review-images bw-op-wizard-single-cover">
                  <img alt="Challenge cover preview" src={imageUrl(draft.coverAssetId)} />
                </div>}
                <span className="bw-op-wizard-review-type">{selectedType?.label}</span>
                <h4>{draft.title}</h4><p>{draft.description}</p>
                {challenge && draft.topics.length > 0 && <p><strong>Categories:</strong> {draft.topics.join(", ")}</p>}
                {challenge && <div><strong>Prizes</strong>{draft.prizes.length
                  ? <ul>{draft.prizes.map((item, i) =>
                    <li key={i}>{CHALLENGE_PRIZE_TYPES[item.type]}: {challengePrizeValue(item)}</li>)}</ul>
                  : <p>To be announced</p>}</div>}
                {challenge && collaborators.length > 0 && <div>
                  <strong>Collaboration invitations</strong>
                  <ul>{collaborators.map(row => <li key={row.organizationId}>{row.organization.name}
                    {" — "}{row.state === "ACCEPTED" ? "Accepted" : row.state === "PENDING" ? "Pending acceptance" : "Invited on save"}
                  </li>)}</ul>
                </div>}
                <dl><div><dt>Deadline</dt><dd>{new Date(draft.deadline).toLocaleString("en-GB")}</dd></div>
                  {challenge ? <>
                    <div><dt>Applicants</dt><dd>{draft.maxApplicants === null ? "Unlimited" : draft.maxApplicants}</dd></div>
                   </> : <>
                    <div><dt>Location</dt><dd>{draft.location}</dd></div>
                    <div><dt>Format</dt><dd>{draft.workMode.replaceAll("_", " ")}</dd></div>
                  </>}
                  <div><dt>Application questions</dt><dd>{draft.questions.length}</dd></div>
                </dl>
              </div>
            </>}
          </div>
        </fieldset>
        <footer className="bw-op-wizard-footer">
          <button className="bw-op-secondary" type="button" disabled={busy || Boolean(uploading)}
            onClick={() => step ? (setError(null), setStep(current => current - 1)) : close()}>
            {step ? "Back" : "Cancel"}
          </button>
          <span className="bw-op-wizard-footer-hint">{opportunity ? "Editing saved listing" : "Saved as draft until you publish"}</span>
          <button className="bw-op-primary" type="submit"
            disabled={locked || (step === 0 && !draft.type)}>
            {busy ? "Saving…" : step === last ? opportunity ? "Save changes" : "Save draft" : "Continue"}
            {!busy && step !== last && <NavigationIcon name="chevron-right" size={16} />}
          </button>
        </footer>
      </form>
    </section>
  </div>;
}
