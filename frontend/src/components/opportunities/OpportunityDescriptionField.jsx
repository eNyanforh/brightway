import NavigationIcon from "../layout/NavigationIcon";

/** A clean, multiline description surface without changing the stored plain-text format. */
export default function OpportunityDescriptionField({ value, onChange, placeholder, rows = 5 }) {
  return <div className="bw-op-description-field">
    <div className="bw-op-description-toolbar">
      <span><NavigationIcon name="file-text" size={18} /> Description</span>
      <span className="bw-op-description-format">Overview &amp; requirements</span>
    </div>
    <label className="bw-op-description-input">
      <span className="bw-op-visually-hidden">Description</span>
      <textarea aria-label="Description" required rows={rows} minLength={30} maxLength={12000}
        value={value} onChange={event => onChange(event.target.value)}
        placeholder={placeholder} />
    </label>
    <div className="bw-op-description-footer">
      <span>Use short paragraphs for readability.</span>
      <span aria-live="off">{value.length.toLocaleString("en-US")} / 12,000</span>
    </div>
  </div>;
}
