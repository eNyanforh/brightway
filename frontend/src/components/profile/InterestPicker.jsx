import { useId, useState } from "react";
import options from "../../../../shared/profile-interests.json";
import { parseEntries } from "../../pages/profile-form";
import "./interest-picker.css";

const catalogKeys = new Set(options.map((label) => label.toLowerCase()));

export default function InterestPicker({ value, onChange, disabled = false }) {
  const [query, setQuery] = useState("");
  const id = useId();
  const selected = parseEntries(value);
  const keys = new Set(selected.map((label) => label.toLowerCase()));
  const matches = options.filter((label) => label.toLowerCase().includes(query.trim().toLowerCase()));
  const legacy = selected.filter((label) => !catalogKeys.has(label.toLowerCase()));
  function remove(label) {
    if (!disabled) onChange(selected.filter((entry) => entry.toLowerCase() !== label.toLowerCase()).join("\n"));
  }
  function toggle(label) {
    if (disabled) return;
    if (keys.has(label.toLowerCase())) remove(label);
    else if (selected.length < 20) onChange([...selected, label].join("\n"));
  }
  return <div className="bw-interest-picker">
    <p id={`${id}-hint`} className="bw-profile-muted">Choose up to 20 interests. At least one is needed for profile completion.</p>
    <p className="bw-interest-count" role="status">{selected.length} of 20 selected</p>
    {selected.length > 0 && <ul className="bw-interest-selected" aria-label="Selected interests">
      {selected.map((label) => <li key={label}>
        <span>{label}</span>
        <button type="button" disabled={disabled} aria-label={`Remove ${label}`} onClick={() => remove(label)}>×</button>
      </li>)}
    </ul>}
    {legacy.length > 0 && <p className="bw-profile-muted">Previously saved interests stay selected until you remove them.</p>}
    <div className="bw-profile-field bw-interest-search">
      <label htmlFor={`${id}-search`}>Search interests</label>
      <input id={`${id}-search`} type="search" value={query} disabled={disabled} placeholder="Find an interest…" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} />
    </div>
    <fieldset className="bw-interest-options" aria-describedby={`${id}-hint`} disabled={disabled}>
      <legend>Choose your interests</legend>
      {matches.map((label) => {
        const checked = keys.has(label.toLowerCase());
        return <label className="bw-interest-choice" key={label}>
          <input type="checkbox" checked={checked} disabled={disabled || (!checked && selected.length >= 20)} onChange={() => toggle(label)} />
          <span>{label}</span>
        </label>;
      })}
    </fieldset>
    {!matches.length && <p className="bw-profile-muted" role="status">No interests match your search.</p>}
  </div>;
}