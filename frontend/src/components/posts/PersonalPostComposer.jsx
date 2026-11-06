import { useId } from "react";
import { photoUrl } from "../../api/profile";
import NavigationIcon from "../layout/NavigationIcon";

const types = [
  { type: "POST", label: "Post", choice: "Share a Post", icon: "post", editor: "Write a post", prompt: "Share a learning or career update…" },
  { type: "ACHIEVEMENT", label: "Achievement", choice: "Share an Achievement", icon: "awards", editor: "Write an achievement", prompt: "What did you achieve, and what did you learn?" },
  { type: "EVENT", label: "Event", choice: "Share an Event", icon: "calendar", editor: "Write an event", prompt: "Tell us about the event. Include the date, time, and location or link." },
];

export function PersonalPostTypeLabel({ type }) {
  const format = types.find(option => option.type === type) ?? types[0];
  return (
    <span className="bw-post-type-label" data-post-type={format.type}>
      <NavigationIcon name={format.icon} size={13} /> {format.label}
    </span>
  );
}

export default function PersonalPostComposer({ account, photoId, body, type, disabled, submitLabel, onBodyChange, onTypeChange, onSubmit }) {
  const radioName = useId();
  const format = types.find(option => option.type === type) ?? types[0];
  const initial = (account?.person?.firstName || account?.username || "B").slice(0, 1).toUpperCase();

  return (
    <form className="bw-personal-composer" aria-label="Create a post" onSubmit={onSubmit}>
      <fieldset className="bw-post-types" disabled={disabled}>
        <legend className="bw-post-type-legend">Post type</legend>
        {types.map(option => (
          <label className="bw-post-type-choice" data-post-type={option.type} key={option.type}>
            <input type="radio" name={radioName} value={option.type} checked={type === option.type}
              onChange={() => onTypeChange(option.type)} />
            <span className="bw-post-type-content">
              <NavigationIcon name={option.icon} size={18} />
              <span>{option.choice}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="bw-personal-composer-editor">
        <div className="bw-timeline-avatar" aria-hidden="true">
          {photoId ? <img src={photoUrl(photoId)} alt="" /> : initial}
        </div>
        <div className="bw-personal-composer-main">
          <textarea aria-label={format.editor} placeholder={format.prompt} rows={2} maxLength={2000}
            value={body} disabled={disabled} onChange={event => onBodyChange(event.target.value)} />
          <div className="bw-personal-composer-footer">
            <span>{body.length ? body.length + " / 2,000" : ""}</span>
            <button className="bw-personal-composer-submit" type="submit" disabled={disabled || !body.trim()}>{submitLabel}</button>
          </div>
        </div>
      </div>
    </form>
  );
}
