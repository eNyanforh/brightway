import { useEffect, useRef, useState } from "react";
import { QUESTION_TYPES } from "../../../../shared/opportunities.mjs";
import { learningApi as api } from "../../api/learning";
const localTime = value => new Date(new Date(value) - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const fresh = () => ({ title: "", opensAt: "", deadline: "", questions: [] });
export default function CycleEditor({ organizationId, program, cycle, onSaved, onClose }) {
  const [draft, setDraft] = useState(() => cycle ? { ...Object.fromEntries(Object.keys(fresh()).map(k => [k, cycle[k]])), opensAt: localTime(cycle.opensAt), deadline: new Date(new Date(cycle.deadline) - new Date(cycle.deadline).getTimezoneOffset() * 60000).toISOString().slice(0, 16) } : fresh());
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const requestKey = useRef(crypto.randomUUID()), request = useRef(null), lock = useRef(false), dialog = useRef(null);
  const lockedForm = Boolean(cycle?.publishedAt);
  useEffect(() => { const previous = document.activeElement; dialog.current?.focus(); return () => { request.current?.abort(); previous?.focus(); }; }, []);
  function field(key, value) { setDraft(old => ({ ...old, [key]: value })); }
  function changeQuestion(index, changes) { field("questions", draft.questions.map((q, i) => i === index ? { ...q, ...changes } : q)); }
  function close() { if (!busy && window.confirm("Close this editor and discard unsaved changes?")) onClose(); }
  async function save(e) {
    e.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError(null);
    const controller = new AbortController(); request.current = controller;
    try {
      const body = { ...draft, programId: program.id, opensAt: new Date(draft.opensAt).toISOString(), deadline: new Date(draft.deadline).toISOString() };
      const result = cycle ? await api.edit(organizationId, cycle.id, { ...body, expectedVersion: cycle.version }, controller.signal)
        : await api.create(organizationId, { ...body, requestKey: requestKey.current }, controller.signal);
      if (!controller.signal.aborted) onSaved(result);
    } catch (e) { if (!controller.signal.aborted) setError(e); }
    finally { if (!controller.signal.aborted) { lock.current = false; setBusy(false); } }
  }
  return <div className="bw-op-overlay" onKeyDown={e => {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    if (e.key === "Tab") { const nodes = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')]; const first = nodes[0], last = nodes.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }
  }}><section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="op-editor-title" className="bw-op-editor">
    <header><div><p className="bw-op-eyebrow">PROGRAM ADMISSION CYCLE</p><h2 id="op-editor-title">{cycle ? "Edit admission cycle" : "Create an admission cycle"}</h2></div><button aria-label="Close editor" type="button" disabled={busy} onClick={close}>×</button></header>
    <form onSubmit={save}>
      {error && <p role="alert">{error.message}</p>}
      <fieldset disabled={busy || error?.status === 409 || [401, 403, 404].includes(error?.status)} className="bw-op-editor-fields">
        <p>{program.title}</p>
        <label>Intake or cycle name<input required minLength={3} maxLength={160} value={draft.title} onChange={e => field("title", e.target.value)} placeholder="January 2027 intake" /></label>
        <div className="bw-op-field-row"><label>Applications open (your local time)<input type="datetime-local" required value={draft.opensAt} onChange={e => field("opensAt", e.target.value)} /></label><label>Application deadline (your local time)<input type="datetime-local" required value={draft.deadline} onChange={e => field("deadline", e.target.value)} /></label></div>
        <section className="bw-op-form-builder"><h3>Application questions</h3><p>{lockedForm ? "The program and questions are locked after first publication." : "Choose what applicants should tell you. All applications are completed on BrightWay."}</p>
          {draft.questions.map((q, i) => <fieldset key={q.id} className="bw-op-builder-question" disabled={lockedForm}><legend>Question {i + 1}</legend><label>Question text<input aria-label={`Question ${i + 1} text`} required minLength={3} maxLength={300} value={q.label} onChange={e => changeQuestion(i, { label: e.target.value })} /></label><div className="bw-op-field-row"><label>Answer type<select aria-label={`Question ${i + 1} type`} value={q.type} onChange={e => changeQuestion(i, { type: e.target.value, options: [] })}>{Object.entries(QUESTION_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><label className="bw-op-checkbox"><input type="checkbox" checked={q.required} onChange={e => changeQuestion(i, { required: e.target.checked })} />Required</label></div>{["SINGLE_CHOICE", "MULTIPLE_CHOICE"].includes(q.type) && <label>Choices (one per line, 2–12)<textarea aria-label={`Question ${i + 1} choices`} required rows={3} value={q.options.join("\n")} onChange={e => changeQuestion(i, { options: e.target.value.split("\n") })} /></label>}<button type="button" className="bw-op-text-button" onClick={() => field("questions", draft.questions.filter((_, index) => index !== i))}>Remove question {i + 1}</button></fieldset>)}
          {!lockedForm && <button className="bw-op-secondary" type="button" disabled={draft.questions.length >= 20} onClick={() => field("questions", [...draft.questions, { id: crypto.randomUUID(), label: "", type: "SHORT_ANSWER", required: true, options: [] }])}>+ Add question</button>}
        </section>
        <div className="bw-op-actions"><button className="bw-op-secondary" type="button" onClick={close}>Cancel</button><button className="bw-op-primary" type="submit">{busy ? "Saving…" : cycle ? "Save changes" : "Save draft"}</button></div>
      </fieldset>
    </form>
  </section></div>;
}
