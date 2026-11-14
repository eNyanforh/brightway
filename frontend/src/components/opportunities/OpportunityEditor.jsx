import { useEffect, useRef, useState } from "react";
import { OPPORTUNITY_TYPES, QUESTION_TYPES } from "../../../../shared/opportunities.mjs";
import { CHALLENGE_COVER_IMAGES, CHALLENGE_COVER_LABELS, CHALLENGE_TOPIC_OPTIONS, DEFAULT_CHALLENGE_COVER, MAX_CHALLENGE_TOPICS } from "../../../../shared/challenges.mjs";
import { opportunitiesApi as api } from "../../api/opportunities";
const fresh = () => ({ type: "JOB", title: "", description: "", location: "", workMode: "IN_PERSON", prize: "", topics: [], coverImage: DEFAULT_CHALLENGE_COVER, deadline: "", questions: [] });
export default function OpportunityEditor({ organizationId, opportunity, onSaved, onClose }) {
  const [draft, setDraft] = useState(() => opportunity ? { ...Object.fromEntries(Object.entries(fresh()).map(([k, initial]) => [k, opportunity[k] ?? initial])), deadline: new Date(new Date(opportunity.deadline) - new Date(opportunity.deadline).getTimezoneOffset() * 60000).toISOString().slice(0, 16) } : fresh());
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const requestKey = useRef(crypto.randomUUID()), request = useRef(null), lock = useRef(false), dialog = useRef(null);
  const lockedForm = Boolean(opportunity?.publishedAt);
  useEffect(() => { const previous = document.activeElement; dialog.current?.focus(); return () => { request.current?.abort(); previous?.focus(); }; }, []);
  function field(key, value) { setDraft(old => ({ ...old, [key]: value })); }
  function changeQuestion(index, changes) { field("questions", draft.questions.map((q, i) => i === index ? { ...q, ...changes } : q)); }
  function close() { if (!busy && window.confirm("Close this editor and discard unsaved changes?")) onClose(); }
  async function save(e) {
    e.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError(null);
    const controller = new AbortController(); request.current = controller;
    try {
      const body = { ...draft, prize: draft.type === "CHALLENGE" ? (draft.prize || "") : "", deadline: new Date(draft.deadline).toISOString() };
      const result = opportunity ? await api.edit(organizationId, opportunity.id, { ...body, expectedVersion: opportunity.version }, controller.signal)
        : await api.create(organizationId, { ...body, requestKey: requestKey.current }, controller.signal);
      if (!controller.signal.aborted) onSaved(result);
    } catch (e) { if (!controller.signal.aborted) setError(e); }
    finally { if (!controller.signal.aborted) { lock.current = false; setBusy(false); } }
  }
  return <div className="bw-op-overlay" onKeyDown={e => {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    if (e.key === "Tab") { const nodes = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')]; const first = nodes[0], last = nodes.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }
  }}><section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="op-editor-title" className="bw-op-editor">
    <header><div><p className="bw-op-eyebrow">ORGANIZATION OPPORTUNITIES</p><h2 id="op-editor-title">{opportunity ? "Edit opportunity" : "Create an opportunity"}</h2></div><button aria-label="Close editor" type="button" disabled={busy} onClick={close}>×</button></header>
    <form onSubmit={save}>
      {error && <p role="alert">{error.message}</p>}
      <fieldset disabled={busy || error?.status === 409 || [401, 403, 404].includes(error?.status)} className="bw-op-editor-fields">
        <div className="bw-op-field-row"><label>Opportunity type<select value={draft.type} disabled={lockedForm} onChange={e => field("type", e.target.value)}>{Object.entries(OPPORTUNITY_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label><label>Format<select value={draft.workMode} onChange={e => field("workMode", e.target.value)}><option value="IN_PERSON">In person</option><option value="REMOTE">Remote</option><option value="HYBRID">Hybrid</option></select></label></div>
        <label>Title<input required minLength={3} maxLength={160} value={draft.title} onChange={e => field("title", e.target.value)} placeholder="A clear title for your opportunity" /></label>
        <label>Description<textarea required rows={7} minLength={30} maxLength={12000} value={draft.description} onChange={e => field("description", e.target.value)} placeholder="Describe the opportunity, eligibility, benefits, and selection process." /></label>
        {draft.type === "CHALLENGE" && <>
          <label>Prize (optional)<input maxLength={120} value={draft.prize || ""} onChange={e => field("prize", e.target.value)} placeholder="e.g. US$500, mentorship, or certificates" /></label>
          <label>Challenge background photo
            <select value={draft.coverImage} onChange={e => field("coverImage", e.target.value)}>
              {Object.entries(CHALLENGE_COVER_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <div className="bw-op-challenge-cover-preview">
            <img src={CHALLENGE_COVER_IMAGES[draft.coverImage] || CHALLENGE_COVER_IMAGES[DEFAULT_CHALLENGE_COVER]} alt="Preview of the Challenge background photo" />
          </div>
          <fieldset className="bw-op-challenge-topics" aria-label="Challenge categories">
            <legend>Challenge categories (choose up to {MAX_CHALLENGE_TOPICS})</legend>
            <div className="bw-op-challenge-topic-options">
              {CHALLENGE_TOPIC_OPTIONS.map(topic => <label key={topic} className="bw-op-challenge-topic">
                <input type="checkbox" value={topic} checked={draft.topics.includes(topic)}
                  disabled={!draft.topics.includes(topic) && draft.topics.length >= MAX_CHALLENGE_TOPICS}
                  onChange={e => field("topics", e.target.checked ? [...draft.topics, topic] : draft.topics.filter(value => value !== topic))} />
                <span>{topic}</span>
              </label>)}
            </div>
          </fieldset>
        </>}
        <div className="bw-op-field-row"><label>Location<input required minLength={2} maxLength={180} value={draft.location} onChange={e => field("location", e.target.value)} placeholder="Monrovia, Liberia or worldwide" /></label><label>Application deadline (your local time)<input type="datetime-local" required value={draft.deadline} onChange={e => field("deadline", e.target.value)} /></label></div>
        <section className="bw-op-form-builder"><h3>Application questions</h3><p>{lockedForm ? "Questions and opportunity type are locked after first publication." : "Choose what applicants should tell you. All applications are completed on BrightWay."}</p>
          {draft.questions.map((q, i) => <fieldset key={q.id} className="bw-op-builder-question" disabled={lockedForm}><legend>Question {i + 1}</legend><label>Question text<input aria-label={`Question ${i + 1} text`} required minLength={3} maxLength={300} value={q.label} onChange={e => changeQuestion(i, { label: e.target.value })} /></label><div className="bw-op-field-row"><label>Answer type<select aria-label={`Question ${i + 1} type`} value={q.type} onChange={e => changeQuestion(i, { type: e.target.value, options: [] })}>{Object.entries(QUESTION_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><label className="bw-op-checkbox"><input type="checkbox" checked={q.required} onChange={e => changeQuestion(i, { required: e.target.checked })} />Required</label></div>{["SINGLE_CHOICE", "MULTIPLE_CHOICE"].includes(q.type) && <label>Choices (one per line, 2–12)<textarea aria-label={`Question ${i + 1} choices`} required rows={3} value={q.options.join("\n")} onChange={e => changeQuestion(i, { options: e.target.value.split("\n") })} /></label>}<button type="button" className="bw-op-text-button" onClick={() => field("questions", draft.questions.filter((_, index) => index !== i))}>Remove question {i + 1}</button></fieldset>)}
          {!lockedForm && <button className="bw-op-secondary" type="button" disabled={draft.questions.length >= 20} onClick={() => field("questions", [...draft.questions, { id: crypto.randomUUID(), label: "", type: "SHORT_ANSWER", required: true, options: [] }])}>+ Add question</button>}
        </section>
        <div className="bw-op-actions"><button className="bw-op-secondary" type="button" onClick={close}>Cancel</button><button className="bw-op-primary" type="submit">{busy ? "Saving…" : opportunity ? "Save changes" : "Save draft"}</button></div>
      </fieldset>
    </form>
  </section></div>;
}
