import { useState } from "react";

export default function PasswordField({ id, label, name, value, onChange, autoComplete, minLength, maxLength = 128, hint, disabled = false }) {
  const [visible, setVisible] = useState(false);
  return <div className={`auth-field auth-field-${name}`}>
    <label htmlFor={id}>{label}</label>
    <div className="auth-password-control">
      <input id={id} name={name} type={visible ? "text" : "password"} required value={value}
        onChange={onChange} autoComplete={autoComplete} minLength={minLength} maxLength={maxLength}
        disabled={disabled} aria-describedby={hint ? `${id}-hint` : undefined} />
      <button type="button" disabled={disabled} aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
        aria-pressed={visible} onClick={() => setVisible((previous) => !previous)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{visible && <path d="m3 3 18 18" />}</svg>
      </button>
    </div>
    {hint && <small id={`${id}-hint`}>{hint}</small>}
  </div>;
}
