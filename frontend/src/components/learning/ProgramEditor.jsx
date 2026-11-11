import { countries } from "./countries";
import { useEffect, useRef, useState } from "react";
import { learningApi as api } from "../../api/learning";
import { PROGRAM_TYPES, STUDY_MODES } from "../../../../shared/learning.mjs";
const fresh = () => ({ title: "", description: "", type: "CERTIFICATE", duration: "", field: "", studyMode: "ON_CAMPUS", countryCode: "LR", location: "", requirements: "" });
export default function ProgramEditor({ organizationId, program, onSaved, onClose }) {
  const [draft, setDraft] = useState(() => program ? Object.fromEntries(Object.keys(fresh()).map(k => [k, program[k]])) : fresh());
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const request = useRef(null), key = useRef(crypto.randomUUID()), lock = useRef(false), dialog = useRef(null);
  useEffect(() => { const previous = document.activeElement; dialog.current?.focus(); return () => { request.current?.abort(); previous?.focus(); }; }, []);
  const field = (name, value) => setDraft(old => ({ ...old, [name]: value }));
  function close() { if (!busy && window.confirm("Discard unsaved program changes?")) onClose(); }
  async function save(e) {
    e.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError(null);
    const c = new AbortController(); request.current = c;
    try { const result = program ? await api.editProgram(organizationId, program.id, { ...draft, expectedVersion: program.version }, c.signal) : await api.createProgram(organizationId, { ...draft, requestKey: key.current }, c.signal); if (!c.signal.aborted) onSaved(result); }
    catch (e) { if (!c.signal.aborted) setError(e); } finally { if (!c.signal.aborted) { lock.current = false; setBusy(false); } }
  }
  return <div className="bw-op-overlay" onKeyDown={e => {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    if (e.key === "Tab") { const nodes = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')]; const first = nodes[0], last = nodes.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }
  }}><section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="program-editor-title" className="bw-op-editor"><header><div><p className="bw-op-eyebrow">EDUCATION & TRAINING</p><h2 id="program-editor-title">{program ? "Edit program" : "Create a program"}</h2></div><button type="button" disabled={busy} aria-label="Close editor" onClick={close}>×</button></header>
    <form onSubmit={save}>{error && <p role="alert">{error.message}</p>}<fieldset className="bw-op-editor-fields" disabled={busy || [401, 403, 404, 409].includes(error?.status)}>
      <label>Program name<input required minLength={3} maxLength={160} value={draft.title} onChange={e => field("title", e.target.value)} placeholder="Certificate in Data Analysis" /></label>
      <label>Description<textarea required rows={5} minLength={30} maxLength={12000} value={draft.description} onChange={e => field("description", e.target.value)} /></label>
      <div className="bw-op-field-row"><label>Program type<select value={draft.type} onChange={e => field("type", e.target.value)}>{Object.entries(PROGRAM_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><label>Study mode<select value={draft.studyMode} onChange={e => field("studyMode", e.target.value)}>{Object.entries(STUDY_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></div>
      <div className="bw-op-field-row"><label>Duration<input required minLength={2} maxLength={120} value={draft.duration} onChange={e => field("duration", e.target.value)} placeholder="6 months" /></label><label>Field of study<input required minLength={2} maxLength={120} value={draft.field} onChange={e => field("field", e.target.value)} placeholder="Computer science" /></label></div>
      <div className="bw-op-field-row"><label>Country<select required value={draft.countryCode} onChange={e => field("countryCode", e.target.value)}>{countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label><label>City or location<input required minLength={2} maxLength={180} value={draft.location} onChange={e => field("location", e.target.value)} /></label></div>
      <label>Entry requirements<textarea required minLength={3} rows={4} maxLength={6000} value={draft.requirements} onChange={e => field("requirements", e.target.value)} /></label>
      <div className="bw-op-actions"><button type="button" className="bw-op-secondary" onClick={close}>Cancel</button><button type="submit" className="bw-op-primary">{busy ? "Saving…" : "Save draft"}</button></div>
    </fieldset></form></section></div>;
}
