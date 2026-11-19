import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/useAuth";
import { OPPORTUNITY_TYPES, QUESTION_TYPES } from "../../../../shared/opportunities.mjs";
import {
  CHALLENGE_TOPIC_OPTIONS, MAX_CHALLENGE_TOPICS, CHALLENGE_PRIZE_TYPES,
  MAX_CHALLENGE_PRIZES, newChallengePrize, challengePrizeValue,
} from "../../../../shared/challenges.mjs";
import NavigationIcon from "../layout/NavigationIcon";
import OpportunityDateTimePicker from "./OpportunityDateTimePicker";
import OpportunityDescriptionField from "./OpportunityDescriptionField";
import OpportunityCategoryIcon from "./OpportunityCategoryIcon";
import ChallengePrizeFields from "./ChallengePrizeFields";
import ChallengeCollaboratorPicker from "./ChallengeCollaboratorPicker";
import ChallengePostTypes from "./ChallengePostTypes";
import ChallengeComposer from "./ChallengeComposer";
import StandardOpportunityComposer from "./StandardOpportunityComposer";
import DedicatedOpportunityWizard from "./DedicatedOpportunityWizard";
import JobCreationStudio from "./JobCreationStudio";
import { isAutoDocumentQuestion, syncDocumentQuestions, requiredDocumentLabels } from "../../../../shared/opportunity-documents.mjs";
import { opportunityPublicationIssues } from "../../../../shared/opportunity-readiness.mjs";
import { scholarshipDeadlineToIso, formatDeadlineInZone } from "../../../../shared/opportunity-timezone.mjs";
import { CHALLENGE_POST_TYPES, describeChallengePostType } from "../../../../shared/challenge-submissions.mjs";
import { opportunitiesApi as api } from "../../api/opportunities";
import "./challenge-sidebar-card.css";
import "./opportunity-editor-wizard.css";
import "./challenge-composer.css";
import "./opportunity-creation-layout.css";

const choices = [
  ["JOB", "Job", "Recruit talent for a position."],
  ["SCHOLARSHIP", "Scholarship", "Support learners with funding."],
  ["CHALLENGE", "Challenge", "Launch a competition hosted on BrightWay."],
  ["EVENT", "Event", "Invite people to an event."],
];
const blank = () => ({
  type: "", title: "", description: "", location: "", workMode: "IN_PERSON",
  jobDetails: null, details: {},
  prize: "", prizes: [], collaboratorIds: [], sponsorLogoIds: [], backgroundAssetId: null,
  titleAssetId: null, coverAssetId: null, postRequirements: [], topics: [],
  deadline: "", questions: [],
});
const scholarshipZone = details => details?.deadlineTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
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
    deadline: opportunity.type === "SCHOLARSHIP" && opportunity.details?.deadlineTimezone
      ? formatDeadlineInZone(opportunity.deadline, opportunity.details.deadlineTimezone)
      : toLocal(opportunity.deadline),
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
  const move = (index, offset) => {
    const indexes = draft.questions.flatMap((q, i) => isAutoDocumentQuestion(q) ? [] : [i]);
    const position = indexes.indexOf(index), target = indexes[position + offset];
    if (target === undefined) return;
    const next = [...draft.questions]; [next[index], next[target]] = [next[target], next[index]];
    field("questions", next);
  };
  return <section className="bw-op-form-builder">
    <h3>Application questions</h3>
    <p>{lockedForm
      ? "Questions are locked after the Challenge or opportunity has been published."
      : "Optional questions are answered and stored privately on BrightWay. No external application forms."}</p>
    {draft.questions.filter(isAutoDocumentQuestion).length > 0 && <p role="status">Application documents: {draft.questions.filter(isAutoDocumentQuestion).map(q => q.label.replace(/^(Required|Optional) document: /, "")).join(", ")}. These uploads are added automatically to the applicant form.</p>}
    {draft.questions.map((q, i) => {
      if (isAutoDocumentQuestion(q)) return null;
      const questionNumber = draft.type === "SCHOLARSHIP"
        ? draft.questions.slice(0, i + 1).filter(item => !isAutoDocumentQuestion(item)).length
        : i + 1;
      return <fieldset key={q.id} className="bw-op-builder-question" disabled={lockedForm || busy}>
      <legend>Question {questionNumber}</legend>
      <label>Question text<input aria-label={`Question ${questionNumber} text`} required minLength={3} maxLength={300}
        value={q.label} onChange={e => changeQuestion(i, { label: e.target.value })} /></label>
      <div className="bw-op-field-row">
        <label>Answer type<select aria-label={`Question ${questionNumber} type`} value={q.type}
          onChange={e => changeQuestion(i, { type: e.target.value, options: [] })}>
          {Object.entries(QUESTION_TYPES).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
        </select></label>
        <label className="bw-op-checkbox"><input type="checkbox" checked={q.required}
          onChange={e => changeQuestion(i, { required: e.target.checked })} />Required</label>
      </div>
      {["SINGLE_CHOICE", "MULTIPLE_CHOICE"].includes(q.type) && <label>
        Choices (one per line, 2–12)<textarea aria-label={`Question ${questionNumber} choices`} rows={3} required
          value={q.options.join("\n")} onChange={e => changeQuestion(i, { options: e.target.value.split("\n") })} />
      </label>}
      {draft.type === "SCHOLARSHIP" && q.type === "LONG_ANSWER" && <label>Essay maximum words (optional)
        <input type="number" min="10" max="1000" value={q.wordLimit ?? ""}
          onChange={e => changeQuestion(i, { wordLimit: e.target.value ? Number(e.target.value) : undefined })}/>
      </label>}
      {!lockedForm && <div className="bw-scholarship-question-actions">
        {draft.type === "SCHOLARSHIP" && <>
          <button type="button" className="bw-op-text-button" disabled={busy || !draft.questions.slice(0, i).some(item => !isAutoDocumentQuestion(item))}
            onClick={() => move(i, -1)}>Move up</button>
          <button type="button" className="bw-op-text-button" disabled={busy || !draft.questions.slice(i + 1).some(item => !isAutoDocumentQuestion(item))}
            onClick={() => move(i, 1)}>Move down</button>
        </>}
        <button type="button" className="bw-op-text-button" onClick={() =>
          field("questions", draft.questions.filter((_, index) => index !== i))}>Remove question {questionNumber}</button>
      </div>}
    </fieldset>;
    })}
    {!lockedForm && <button className="bw-op-secondary" type="button" disabled={busy || draft.questions.length >= 20}
      onClick={() => field("questions", [...draft.questions, {
        id: crypto.randomUUID(), label: "", type: "SHORT_ANSWER", required: true, options: [],
      }])}>+ Add question</button>}
  </section>;
}

export default function OpportunityEditor({ organizationId, organization, opportunity, onSaved, onClose }) {
  const { account } = useAuth();
  const draftKey = "brightway:opportunity-draft:" + account.id + ":" + organizationId;
  const [draft, setDraft] = useState(() => {
    if (opportunity) return initialDraft(opportunity);
    try {
      const recovered = JSON.parse(window.sessionStorage.getItem(draftKey) || "null");
      if (["JOB", "SCHOLARSHIP"].includes(recovered?.type))
        return { ...blank(), ...recovered };
    } catch { /* Private browsing may not permit session storage. */ }
    return blank();
  });
  const [collaborators, setCollaborators] = useState(() =>
    (opportunity?.collaborators || []).map(item => ({
      organizationId: item.organizationId, organization: item.organization, state: item.state,
    })));
  const [step, setStep] = useState(0), [busy, setBusy] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(Boolean(opportunity));
  const [autosaveStatus, setAutosaveStatus] = useState("loading");
  const [uploading, setUploading] = useState(""), [error, setError] = useState(null);
  const requestKey = useRef(crypto.randomUUID()), request = useRef(null), persisted = useRef(opportunity || null);
  const uploadController = useRef(null), lock = useRef(false), dialog = useRef(null);
  const lockedForm = Boolean(opportunity?.publishedAt);
  const challenge = draft.type === "CHALLENGE";
  const dedicated = ["JOB", "SCHOLARSHIP"].includes(draft.type);
  const dedicatedComposer = step > 0 && dedicated;
  const jobStudio = step > 0 && draft.type === "JOB";
  const singlePageComposer = step > 0 && (challenge || draft.type === "EVENT");
  const challengeComposer = challenge && singlePageComposer;
  const standardComposer = singlePageComposer && !challenge;
  const steps = challenge
    ? ["Opportunity type", "Challenge details", "Prizes & collaborators", "Cover photo", "Post types", "Applications", "Review"]
    : draft.type === "JOB"
      ? ["Opportunity type", "Job Details", "Pay & Requirements", "Applications", "Review & Publish"]
      : draft.type === "SCHOLARSHIP"
        ? ["Opportunity type", "Basic Information", "Award Details", "Eligibility Criteria", "Application Requirements", "Timeline", "Selection Process", "Review & Publish"]
        : ["Opportunity type", "Opportunity details", "Applications", "Review"];
  const last = steps.length - 1;

  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.focus();
    return () => { request.current?.abort(); uploadController.current?.abort(); previous?.focus(); };
  }, []);
  useEffect(() => { if (step > 0) dialog.current?.querySelector("#bw-op-step-heading")?.focus(); }, [step]);
  useEffect(() => {
    if (opportunity || !["JOB", "SCHOLARSHIP"].includes(draft.type)) return;
    try { window.sessionStorage.setItem(draftKey, JSON.stringify(draft)); }
    catch { /* An unavailable browser session store does not block editing. */ }
  }, [draft, opportunity, draftKey]);
  useEffect(() => {
    // Do not load an unrelated scholarship draft while creating another type.
    if (opportunity || draft.type !== "SCHOLARSHIP") return;
    const controller = new AbortController();
    setDraftLoaded(false);
    api.getScholarshipDraft(organizationId, controller.signal)
      .then(result => {
        if (controller.signal.aborted || result.draft?.type !== "SCHOLARSHIP") return;
        setDraft(current => {
          // Never overwrite an active editor or a more complete browser recovery.
          if (current.type !== "SCHOLARSHIP" || current.title.trim() ||
              current.description.trim() || current.location.trim()) return current;
          return { ...blank(), ...result.draft };
        });
      })
      .catch(() => { /* Offline browser recovery stays available. */ })
      .finally(() => { if (!controller.signal.aborted) setDraftLoaded(true); });
    return () => controller.abort();
  }, [opportunity, organizationId, draft.type]);
  useEffect(() => {
    if (opportunity || !draftLoaded || draft.type !== "SCHOLARSHIP" || persisted.current) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setAutosaveStatus("saving");
      api.saveScholarshipDraft(organizationId, draft, controller.signal)
        .then(() => { if (!controller.signal.aborted) setAutosaveStatus("saved"); })
        .catch(() => { if (!controller.signal.aborted) setAutosaveStatus("offline"); });
    }, 1500);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [draft, draftLoaded, opportunity, organizationId]);
  function field(key, value) {
    setDraft(old => {
      if (key === "details" && ["JOB", "SCHOLARSHIP"].includes(old.type)) {
        if (lockedForm && JSON.stringify(requiredDocumentLabels(old.type, value)) !==
            JSON.stringify(requiredDocumentLabels(old.type, old.details))) return old;
        return { ...old, details: value, questions: lockedForm ? old.questions :
          syncDocumentQuestions(old.type, value, old.questions, () => crypto.randomUUID()) };
      }
      return { ...old, [key]: value };
    });
  }
  async function saveIncompleteDraft() {
    if (busy || uploading || draft.type !== "SCHOLARSHIP") return;
    setAutosaveStatus("saving");
    try {
      await api.saveScholarshipDraft(organizationId, draft);
      setAutosaveStatus("saved");
    } catch {
      setAutosaveStatus("offline");
    }
  }
  function changeQuestion(index, changes) {
    setDraft(old => ({ ...old, questions: old.questions.map((question, i) =>
      i === index ? { ...question, ...changes } : question) }));
  }
  function close() {
    const scholarshipDraft = !opportunity && draft.type === "SCHOLARSHIP";
    const message = scholarshipDraft
      ? "Close the editor? Your draft will remain available for recovery. Recent changes may still be saving."
      : "Close this editor and discard unsaved changes?";
    if (!busy && !uploading && window.confirm(message)) {
      if (!scholarshipDraft) {
        try { window.sessionStorage.removeItem(draftKey); } catch { /* Ignore disabled storage. */ }
      }
      onClose();
    }
  }
  function changeType(type) {
    if (lockedForm) return;
    setDraft(old => ({
      ...old, type,
      ...(old.type !== type ? {
        details: type === "JOB" ? { requireCv: false, cvStatus: "none", vacancies: 1 } : type === "SCHOLARSHIP" ?
          { requireTranscript: true, requireStatement: true, deadlineTimezone: scholarshipZone() } : {},
        jobDetails: null,
        questions: ["JOB", "SCHOLARSHIP"].includes(type)
          ? syncDocumentQuestions(type, type === "JOB" ? { requireCv: false } :
              { requireTranscript: true, requireStatement: true },
              old.questions.filter(q => !isAutoDocumentQuestion(q)), () => crypto.randomUUID())
          : old.questions.filter(q => !isAutoDocumentQuestion(q)),
      } : {}),
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
    if (dedicated) {
      const d = draft.details || {};
      const has = value => typeof value === "string" && value.trim().length > 0;
      const list = value => Array.isArray(value) && value.some(v => typeof v === "string" && v.trim());
      if (draft.type === "JOB") {
        const categories = Array.isArray(d.categories) && d.categories.length ? d.categories : d.category ? [d.category] : [];
        const types = Array.isArray(d.jobTypes) && d.jobTypes.length ? d.jobTypes : draft.jobDetails?.type ? [draft.jobDetails.type] : [];
        const levels = Array.isArray(d.experienceLevels) && d.experienceLevels.length ? d.experienceLevels : d.experienceLevel ? [d.experienceLevel] : [];
        if (step === 1) {
          if (draft.title.trim().length < 3 || draft.description.trim().length < 30)
            return "Enter a job title and overview of at least 30 characters.";
          if (!categories.length) return "Select at least one job category.";
          if (!types.length) return "Select at least one job type.";
          if (draft.location.trim().length < 2) return "Provide the work location or eligible remote countries.";
        }
        if (step === 2) {
          if (!draft.jobDetails?.compensationType) return "Choose the compensation type.";
          if (!levels.length) return "Select at least one experience level.";
          if (levels.includes("NO_EXPERIENCE") && d.experienceMonths > 0) return "No experience required cannot have a positive minimum experience.";
          if (!d.education) return "Choose the minimum education qualification.";
          if (!list(d.responsibilities)) return "Add at least one key responsibility.";
          const j = draft.jobDetails;
          const hasAmount = j.salaryMin != null || j.salaryMax != null;
          if (hasAmount && (j.salaryMin == null || j.salaryMax == null || j.salaryMin > j.salaryMax ||
            !j.salaryCurrency || !j.salaryPeriod)) return "Provide a valid compensation amount, currency and payment frequency.";
        }
        if (step === 3 && (!draft.deadline || new Date(draft.deadline).getTime() <= Date.now()))
          return "Choose a future application deadline.";
        if (step === last && !lockedForm) {
          const issues = opportunityPublicationIssues(draft);
          if (issues.length) return issues[0];
        }
      } else {
        if (step === 1) {
          if (draft.title.trim().length < 3 || draft.description.trim().length < 30)
            return "Enter a scholarship title and description of at least 30 characters.";
          if (!has(d.category)) return "Select a scholarship category.";
          if (!list(d.academicLevels)) return "Select at least one academic level.";
        }
        if (step === 2) {
          if (!has(d.fundingType)) return "Choose the scholarship funding type.";
          if (d.fundingType === "FIXED_AMOUNT" && (!(d.value > 0) || !["USD", "LRD", "EUR", "GBP"].includes(d.currency)))
            return "Enter a positive scholarship amount and select its currency.";
          if (d.awardsAvailable != null && (!Number.isInteger(d.awardsAvailable) || d.awardsAvailable < 1))
            return "Number of awards must be a positive whole number.";
        }
        if (step === 3) {
          if (draft.location.trim().length < 2) return "Enter the study destination or Worldwide.";
          if (!list(d.eligibleCountries)) return "Enter eligible countries or Worldwide.";
          if (d.minAge != null && d.maxAge != null && d.minAge > d.maxAge)
            return "Minimum eligible age must not exceed maximum age.";
        }
        if (step === 4) {
          if (draft.questions.some(q => ["SINGLE_CHOICE", "MULTIPLE_CHOICE"].includes(q.type) &&
            (q.options.length < 2 || q.options.length > 12 || q.options.some(option => !option.trim()))))
            return "Choice questions need 2–12 non-empty options.";
          if (draft.questions.some(q => !q.label.trim() || q.label.trim().length < 3))
            return "Enter a meaningful label for each application question.";
        }
        if (step === 5) {
          let deadlineTime;
          try { deadlineTime = new Date(scholarshipDeadlineToIso(draft.deadline, scholarshipZone(d))).getTime(); }
          catch { return "Choose a valid date and time in the selected timezone."; }
          if (!draft.deadline || deadlineTime <= Date.now())
            return "Choose a future application deadline.";
          if (d.openingDate && new Date(scholarshipDeadlineToIso(d.openingDate + "T00:00", scholarshipZone(d))).getTime() > deadlineTime)
            return "Application opening date must be before the deadline.";
        }
        if (step === 6) {
          if (!list(d.selectionCriteria)) return "Add at least one selection criterion.";
          if (d.selectionMethod === "SCORING_RUBRIC" &&
            (!(d.scoringRubric || []).length || d.scoringRubric.some(row => !row.label.trim()) ||
              d.scoringRubric.reduce((sum, row) => sum + row.weight, 0) !== 100))
            return "Scoring rubric criteria must have names and weights totaling 100%.";
        }
        if (step === last && !lockedForm) {
          let convertedDeadline;
          try { convertedDeadline = scholarshipDeadlineToIso(draft.deadline, scholarshipZone(d)); }
          catch { return "Choose a valid deadline in the selected timezone."; }
          const issues = opportunityPublicationIssues({ ...draft, deadline: convertedDeadline });
          if (issues.length) return issues[0];
        }
      }
      if (draft.questions.length > 20 || draft.questions.filter(q => q.type === "FILE_UPLOAD").length > 12)
        return "Use at most 20 questions, including up to 12 document uploads.";
      return null;
    }
    if (challenge && (challengeComposer || steps[step] === "Cover photo") && !draft.coverAssetId &&
        !opportunity?.backgroundAssetId && !opportunity?.titleAssetId)
      return "Upload a Challenge cover photo to continue.";
    if (challenge && (challengeComposer || steps[step] === "Post types") && draft.postRequirements.some(item => {
      if (item.type === "VIDEO_POST") return item.minDurationSeconds < 1 ||
        item.maxDurationSeconds > 3600 || item.minDurationSeconds > item.maxDurationSeconds;
      if (item.type === "CAPTION") return item.minWords < 1 ||
        item.maxWords > 1000 || item.minWords > item.maxWords;
      if (item.type === "PHOTO_POST") return item.minImages < 1 ||
        item.maxImages > 4 || item.minImages > item.maxImages;
      return item.maxPages < 1 || item.maxPages > 100;
    })) return "Check each post type's minimum and maximum requirements.";
    if (singlePageComposer || steps[step]?.endsWith("Applications")) {
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
    if (!singlePageComposer && step < last) { setStep(current => current + 1); return; }
    if (draft.type === "JOB" && (!draft.jobDetails?.type || !draft.jobDetails?.compensationType ||
        ((draft.jobDetails.salaryMin !== null || draft.jobDetails.salaryMax !== null) &&
          (draft.jobDetails.salaryMin === null || draft.jobDetails.salaryMax === null ||
            !draft.jobDetails.salaryCurrency || !draft.jobDetails.salaryPeriod ||
            draft.jobDetails.salaryMin > draft.jobDetails.salaryMax)))) {
      setError(new Error("Choose a job type and compensation, and enter a valid salary range if disclosed.")); return;
    }
    let normalizedDeadline;
    try {
      normalizedDeadline = draft.type === "SCHOLARSHIP"
        ? scholarshipDeadlineToIso(draft.deadline, scholarshipZone(draft.details))
        : new Date(draft.deadline).toISOString();
    } catch {
      setError(new Error("Choose a valid application deadline in the selected timezone.")); return;
    }
    if (!draft.type || draft.title.trim().length < 3 || draft.description.trim().length < 30 ||
        !draft.deadline || new Date(normalizedDeadline).getTime() <= Date.now()) {
      setError(new Error("Check the required details and future deadline before saving.")); return;
    }
    const publishOnSave = dedicatedComposer && step === last && e.nativeEvent?.submitter?.value === "publish";
    lock.current = true; setBusy(true);
    const controller = new AbortController(); request.current = controller;
    try {
      const body = {
        ...draft,
        location: challenge ? "BrightWay" : draft.location,
        workMode: challenge ? "REMOTE" : draft.workMode,
        jobDetails: draft.type === "JOB" ? draft.jobDetails : null,
        details: ["JOB", "SCHOLARSHIP"].includes(draft.type)
          ? Object.fromEntries(Object.entries(draft.details || {}).map(([key, value]) =>
            [key, Array.isArray(value) ? value.map(item => item.trim()).filter(Boolean) : value])) : {},
        // The structured prizes are canonical. Removing every prize must not
        // silently restore a legacy reward from a previous save.
        prize: "",
        prizes: challenge ? draft.prizes : [],
        postRequirements: challenge ? draft.postRequirements : [],
        collaboratorIds: challenge ? draft.collaboratorIds : [],
        sponsorLogoIds: challenge ? draft.sponsorLogoIds : [],
        backgroundAssetId: challenge ? draft.backgroundAssetId : null,
        titleAssetId: challenge ? draft.titleAssetId : null,
        coverAssetId: draft.coverAssetId,
        deadline: normalizedDeadline,
      };
      const current = persisted.current;
      const saved = current
        ? await api.edit(organizationId, current.id,
          { ...body, expectedVersion: current.version }, controller.signal)
        : await api.create(organizationId, { ...body, requestKey: requestKey.current }, controller.signal);
      persisted.current = saved;
      const completed = publishOnSave
        ? await api.status(organizationId, saved.id,
          { expectedVersion: saved.version, status: "PUBLISHED" }, controller.signal)
        : saved;
      if (!controller.signal.aborted) {
        try { window.sessionStorage.removeItem(draftKey); } catch { /* Ignore disabled storage. */ }
        if (draft.type === "SCHOLARSHIP") {
          try { await api.deleteScholarshipDraft(organizationId, controller.signal); }
          catch { /* Saved listing remains authoritative even if draft cleanup fails. */ }
        }
        onSaved(completed);
      }
    } catch (cause) { if (!controller.signal.aborted) setError(cause); }
    finally { if (!controller.signal.aborted) { lock.current = false; setBusy(false); } }
  }
  const stepName = steps[step];
  const selectedType = OPPORTUNITY_TYPES[draft.type];
  const imageUrl = id => id ? api.challengeAssetUrl(id) : null;

  const locked = busy || Boolean(uploading) || error?.status === 409 ||
    [401, 403, 404].includes(error?.status);

  return <div className={"bw-op-overlay bw-op-wizard-overlay bw-op-creation-overlay" + (draft.type === "SCHOLARSHIP" ? " bw-op-creation-scholarship" : "") + (jobStudio ? " bw-op-job-studio-overlay" : "") + (dedicatedComposer ? " bw-op-creation-dedicated" : "") + (singlePageComposer ? " bw-op-challenge-overlay" : "") + (standardComposer || dedicatedComposer ? " bw-op-standard-overlay" : "")} onKeyDown={e => {
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
          <h2 id="op-editor-title">{draft.type === "SCHOLARSHIP" && dedicatedComposer ? (opportunity ? "Edit scholarship" : "Create a scholarship") : jobStudio ? (opportunity ? "Edit job vacancy" : "Create a job vacancy") : singlePageComposer
            ? (opportunity ? "Edit " : "Create a ") + OPPORTUNITY_TYPES[draft.type].label
            : opportunity ? "Edit your opportunity" : "Create an opportunity"}</h2>
          <p>{jobStudio ? "A clear listing attracts the right candidates" :
            singlePageComposer ? "Cover, details, deadline and applications" : dedicatedComposer ?
              "Step " + step + " of " + last + " · " + steps[step] : "Step " + (step + 1) + " of " + steps.length}</p>
          {dedicatedComposer && !jobStudio && !opportunity && <p className="bw-op-wizard-help" role="status">
            {draft.type === "SCHOLARSHIP" ? autosaveStatus === "saved" ? "Draft automatically saved to BrightWay"
              : autosaveStatus === "saving" ? "Saving scholarship draft…"
              : autosaveStatus === "offline" ? "Offline: changes remain in this browser tab"
              : "Loading your scholarship draft…" : "Changes remain in this browser tab until saved."}
          </p>}
        </div>
        <button aria-label="Close editor" type="button" disabled={busy || Boolean(uploading)} onClick={close}>×</button>
      </header>
      {!singlePageComposer && !jobStudio && <nav className="bw-op-wizard-progress" aria-label="Creation progress">
        {steps.map((label, index) => <button type="button" key={label}
          className={index === step ? "is-current" : index < step ? "is-complete" : ""}
          disabled={index > step}
          aria-current={index === step ? "step" : undefined}
          onClick={() => { if (index < step) { setError(null); setStep(index); } }}>
          <span aria-hidden="true">{index < step ? "✓" : index + 1}</span>
          <span className="bw-op-progress-label">{label}</span>
        </button>)}
      </nav>}
      <form onSubmit={submit}>
        {error && <div className="bw-op-wizard-error" role="alert">{error.message}</div>}
        <fieldset className={"bw-op-editor-fields bw-op-wizard-fields" + (singlePageComposer ? " is-challenge-composer" : "")} disabled={locked}>
          {jobStudio ? <JobCreationStudio draft={draft} field={field} step={step}
            organizationName={organization?.name || opportunity?.organization?.name || "Your organization"}
            opportunity={opportunity} locked={locked} uploading={uploading} upload={upload}
            onGoStep={next => { setError(null); setStep(next); }}
            questions={<QuestionBuilder draft={draft} field={field} changeQuestion={changeQuestion}
              lockedForm={lockedForm} busy={busy} />} /> :
            dedicatedComposer ? <DedicatedOpportunityWizard draft={draft} field={field} step={step}
              opportunity={opportunity} locked={locked} uploading={uploading} upload={upload}
              questions={<QuestionBuilder draft={draft} field={field} changeQuestion={changeQuestion}
                lockedForm={lockedForm} busy={busy} />} /> :
            challengeComposer ? <ChallengeComposer draft={draft} field={field}
            organizationId={organizationId} collaborators={collaborators}
            setCollaborators={setCollaborators} locked={locked} lockedForm={lockedForm}
            uploading={uploading} upload={upload}
            questions={<QuestionBuilder draft={draft} field={field} changeQuestion={changeQuestion}
              lockedForm={lockedForm} busy={busy} />} /> :
            standardComposer ? <StandardOpportunityComposer draft={draft} field={field}
              opportunity={opportunity} locked={locked} uploading={uploading} upload={upload}
              questions={<QuestionBuilder draft={draft} field={field} changeQuestion={changeQuestion}
                lockedForm={lockedForm} busy={busy} />} /> :
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
              <OpportunityDescriptionField value={draft.description} rows={6}
                onChange={value => field("description", value)}
                placeholder={challenge ? "Explain the goal, rules, judging criteria, and what participants must submit on BrightWay." : "Describe eligibility, benefits and the selection process."} />
              {challenge ? <>
                <fieldset className="bw-op-challenge-topics" aria-label="Challenge categories">
                  <legend>Categories (choose up to {MAX_CHALLENGE_TOPICS})</legend>
                  <div className="bw-op-challenge-topic-options">{CHALLENGE_TOPIC_OPTIONS.map(topic =>
                    <label key={topic} className="bw-op-challenge-topic">
                      <input type="checkbox" value={topic} checked={draft.topics.includes(topic)}
                        disabled={!draft.topics.includes(topic) && draft.topics.length >= MAX_CHALLENGE_TOPICS}
                        onChange={e => field("topics", e.target.checked
                          ? [...draft.topics, topic] : draft.topics.filter(value => value !== topic))} />
                      <OpportunityCategoryIcon category={topic} /><span>{topic}</span>
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

            {challenge && stepName === "Post types" && <ChallengePostTypes
              requirements={draft.postRequirements} onChange={value => field("postRequirements", value)}
              disabled={locked} locked={lockedForm} />}

            {stepName === "Applications" && <>
              <OpportunityDateTimePicker value={draft.deadline}
                onChange={value => field("deadline", value)} />
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
                {challenge && draft.postRequirements.length > 0 && <div>
                  <strong>Required post types</strong>
                  <ul>{draft.postRequirements.map(item => <li key={item.id}>
                    {CHALLENGE_POST_TYPES[item.type]} — {describeChallengePostType(item)}
                  </li>)}</ul>
                </div>}
                {challenge && collaborators.length > 0 && <div>
                  <strong>Collaboration invitations</strong>
                  <ul>{collaborators.map(row => <li key={row.organizationId}>{row.organization.name}
                    {" — "}{row.state === "ACCEPTED" ? "Accepted" : row.state === "PENDING" ? "Pending acceptance" : "Invited on save"}
                  </li>)}</ul>
                </div>}
                <dl><div><dt>Deadline</dt><dd>{new Date(draft.deadline).toLocaleString("en-GB")}</dd></div>
                  {!challenge && <>
                    <div><dt>Location</dt><dd>{draft.location}</dd></div>
                    <div><dt>Format</dt><dd>{draft.workMode.replaceAll("_", " ")}</dd></div>
                  </>}
                  <div><dt>Application questions</dt><dd>{draft.questions.length}</dd></div>
                </dl>
              </div>
            </>}
          </div>}
        </fieldset>
        <footer className="bw-op-wizard-footer">
          <button className="bw-op-secondary" type="button" disabled={busy || Boolean(uploading)}
            onClick={() => singlePageComposer && opportunity ? close() : step ? (setError(null), setStep(current => current - 1)) : close()}>
            {singlePageComposer ? opportunity ? "Cancel" : "Back to types" : step ? "Back" : "Cancel"}
          </button>
          <span className="bw-op-wizard-footer-hint">{jobStudio ? (opportunity ? "Editing an existing listing" : "Changes stored in this browser tab") : opportunity ? "Editing saved listing" : draft.type === "SCHOLARSHIP" ? autosaveStatus === "saved" ? "Draft autosaved to BrightWay" : autosaveStatus === "offline" ? "Offline · saved in browser" : "Scholarship draft autosave enabled" : "Changes stored in this browser tab until saved"}</span>
          {draft.type === "SCHOLARSHIP" && dedicatedComposer && step < last && <button className="bw-op-secondary"
            type="button" disabled={locked} onClick={saveIncompleteDraft}>Save draft</button>}
          {dedicatedComposer && step === last ? <>
            <button className="bw-op-secondary" type="submit" name="intent" value="draft" disabled={locked}>
              {busy ? "Saving…" : opportunity ? "Save changes" : "Save draft"}
            </button>
            <button className="bw-op-primary" type="submit" name="intent" value="publish" disabled={locked}>
              {busy ? "Publishing…" : "Publish " + (draft.type === "JOB" ? "Job Vacancy" : "Scholarship")}
            </button>
          </> : <button className="bw-op-primary" type="submit"
            disabled={locked || (step === 0 && !draft.type)}>
            {busy ? "Saving…" : singlePageComposer || step === last ? opportunity ? "Save changes" : "Save draft" : "Continue"}
            {!busy && !singlePageComposer && step !== last && <NavigationIcon name="chevron-right" size={16} />}
          </button>}
        </footer>
      </form>
    </section>
  </div>;
}
