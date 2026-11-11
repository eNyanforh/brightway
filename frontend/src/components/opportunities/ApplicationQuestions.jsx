import { opportunitiesApi as api } from "../../api/opportunities";
export default function ApplicationQuestions({ questions, answers, onChange, files = [], onFile, disabled, applicationId, organizationId, readOnly = false, filesApi = api }) {
  return <div className="bw-op-questions">{questions.map((q, index) => {
    const value = answers[q.id];
    const file = files.find(f => f.questionId === q.id);
    return <fieldset key={q.id} className="bw-op-question" disabled={disabled}>
      <legend>{index + 1}. {q.label}{q.required && <span aria-label="required"> *</span>}</legend>
      {q.type === "FILE_UPLOAD" ? <>
        {file && <a href={filesApi.filesUrl(applicationId, file.id, organizationId)} download>Download attachment ({Math.ceil(file.size / 1024)} KB)</a>}
        {!readOnly && <label className="bw-op-file">{file ? "Replace attachment" : "Choose a file"}<input type="file" aria-label={q.label} accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => { const selected = e.target.files?.[0]; if (selected) onFile(q.id, selected); e.target.value = ""; }} /><span>PDF, JPG, PNG, or WebP · up to 5 MiB</span></label>}
        {readOnly && !file && <p>No file provided</p>}
      </> : readOnly ? <p className="bw-op-answer">{value === undefined || value === "" ? "No answer provided" : typeof value === "boolean" ? value ? "Yes" : "No" : Array.isArray(value) ? value.join(", ") : value}</p>
        : q.type === "YES_NO" || q.type === "SINGLE_CHOICE" ? <select aria-label={q.label} value={q.type === "YES_NO" ? value === undefined ? "" : String(value) : value || ""} onChange={e => onChange(q.id, q.type === "YES_NO" ? e.target.value === "" ? undefined : e.target.value === "true" : e.target.value)}><option value="">Choose an answer</option>{(q.type === "YES_NO" ? [["true", "Yes"], ["false", "No"]] : q.options.map(o => [o, o])).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select>
        : q.type === "MULTIPLE_CHOICE" ? <div className="bw-op-choices">{q.options.map(option => <label key={option}><input type="checkbox" checked={Array.isArray(value) && value.includes(option)} onChange={e => onChange(q.id, e.target.checked ? [...(value || []), option] : value.filter(v => v !== option))} />{option}</label>)}</div>
        : q.type === "LONG_ANSWER" ? <textarea aria-label={q.label} rows={5} value={value || ""} maxLength={5000} onChange={e => onChange(q.id, e.target.value)} />
        : <input aria-label={q.label} value={value || ""} maxLength={500} onChange={e => onChange(q.id, e.target.value)} />}
    </fieldset>;
  })}</div>;
}
