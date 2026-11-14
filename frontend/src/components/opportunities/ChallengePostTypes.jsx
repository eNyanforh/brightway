import {
  CHALLENGE_POST_TYPES, MAX_CHALLENGE_POST_TYPES, newChallengePostType,
  describeChallengePostType,
} from "../../../../shared/challenge-submissions.mjs";
import "./challenge-post-types.css";

export default function ChallengePostTypes({ requirements, onChange, disabled = false, locked = false }) {
  const chosen = new Set(requirements.map(item => item.type));
  function change(index, patch) {
    onChange(requirements.map((item, i) => i === index ? { ...item, ...patch } : item));
  }
  function add() {
    const available = Object.keys(CHALLENGE_POST_TYPES).find(type => !chosen.has(type));
    if (!available) return;
    onChange([...requirements, newChallengePostType(available, crypto.randomUUID())]);
  }
  const range = (index, item, left, right, labelLeft, labelRight, max, unit) =>
    <div className="bw-op-field-row">
      <label>{labelLeft}
        <input type="number" required min={1} max={max} step={1} value={item[left]}
          aria-label={`Post type ${index + 1} ${labelLeft}`}
          onChange={e => change(index, { [left]: e.target.value === "" ? "" : Number(e.target.value) })} />
      </label>
      <label>{labelRight}
        <input type="number" required min={1} max={max} step={1} value={item[right]}
          aria-label={`Post type ${index + 1} ${labelRight}`}
          onChange={e => change(index, { [right]: e.target.value === "" ? "" : Number(e.target.value) })} />
      </label>
      <small>Values are in {unit}.</small>
    </div>;

  return <section className="bw-challenge-post-types" aria-label="Challenge post types">
    <p className="bw-op-wizard-help">Specify what participants must post on BrightWay. Add more than one post type when a Challenge needs multiple deliverables.</p>
    {requirements.length === 0 && <div className="bw-challenge-post-empty">
      No post types selected. Add a type to define submission requirements.</div>}
    {requirements.map((item, index) => <fieldset className="bw-challenge-post-type" key={item.id} disabled={disabled || locked}>
      <legend>Post type {index + 1}</legend>
      <div className="bw-challenge-post-type-head">
        <label>Post Type
          <select value={item.type} aria-label={`Post type ${index + 1}`}
            onChange={e => onChange(requirements.map((row, i) =>
              i === index ? newChallengePostType(e.target.value, row.id) : row))}>
            {Object.entries(CHALLENGE_POST_TYPES).map(([type, name]) =>
              <option value={type} key={type} disabled={chosen.has(type) && item.type !== type}>{name}</option>)}
          </select>
        </label>
        {!locked && <button type="button" className="bw-op-text-button"
          onClick={() => onChange(requirements.filter((_, i) => i !== index))}
          aria-label={`Remove post type ${index + 1}`}>Remove</button>}
      </div>

      {item.type === "VIDEO_POST" && <>
        {range(index, item, "minDurationSeconds", "maxDurationSeconds",
          "Minimum duration", "Maximum duration", 3600, "seconds")}
        <p className="bw-challenge-post-hint">Participants link their own published BrightWay video post. The organizer checks its actual duration during review.</p>
      </>}
      {item.type === "CAPTION" && range(index, item, "minWords", "maxWords",
        "Minimum words", "Maximum words", 1000, "words")}
      {item.type === "PHOTO_POST" && range(index, item, "minImages", "maxImages",
        "Minimum photos", "Maximum photos", 4, "images")}
      {item.type === "DOCUMENT_POST" && <label>Maximum PDF pages
        <input type="number" required min={1} max={100} step={1}
          aria-label={`Post type ${index + 1} Maximum PDF pages`}
          value={item.maxPages}
          onChange={e => change(index, { maxPages: e.target.value === "" ? "" : Number(e.target.value) })} />
      </label>}
      <small className="bw-challenge-post-summary">{describeChallengePostType(item)}</small>
    </fieldset>)}
    {!locked && <button className="bw-op-secondary" type="button"
      disabled={disabled || requirements.length >= MAX_CHALLENGE_POST_TYPES}
      onClick={add}>+ Add post type</button>}
    {locked && <p>Post requirements are locked after the Challenge is first published.</p>}
  </section>;
}
