import { useId } from "react";
export default function SchoolForm({ title, description, fields, action, onSubmit, busy, children }) {
  const id = useId();
  return <form className="bw-school-form" aria-labelledby={id} onSubmit={async e => { e.preventDefault(); const form = e.currentTarget, data = new FormData(form); const ok = await onSubmit(data); if (ok) form.reset(); }}>
    {title && <div className="bw-school-form-heading"><h4 id={id}>{title}</h4>{description && <p>{description}</p>}</div>}
    <div className="bw-school-fields">{fields.map(f => <label key={f.name}>{f.label}{f.options ? <select name={f.name} required={!f.optional} defaultValue={f.value || ""} disabled={busy || f.disabled} multiple={f.multiple}>
      {!f.multiple && <option value="">Choose {f.label.toLowerCase()}</option>}{f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select> : <input name={f.name} type={f.type || "text"} required={!f.optional} defaultValue={f.value ?? ""} maxLength={f.maxLength || 160} min={f.min} max={f.max} step={f.step} disabled={busy || f.disabled} placeholder={f.placeholder} />}</label>)}</div>
    {children}<button className="bw-school-primary" type="submit" disabled={busy}>{busy ? "Saving…" : action || "Save"}</button>
  </form>;
}
