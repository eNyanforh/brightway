import { useId, useRef, useState } from "react";
import { MAX_POST_TOPICS, MAX_POST_TOPIC_LENGTH, normalizePostTopic } from "../../../../shared/post-topics.mjs";
import { photoUrl } from "../../api/profile";
import Icon from "../layout/Icon";
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

export function PostTopicTags({ tags, onRemove, disabled }) {
  if (!tags?.length) return null;
  return (
    <ul className="bw-post-topic-tags" aria-label={onRemove ? "Selected topic tags" : "Topic tags"}>
      {tags.map(tag => (
        <li key={tag}>
          <span>{tag}</span>
          {onRemove && <button type="button" aria-label={"Remove tag " + tag} disabled={disabled} onClick={() => onRemove(tag)}><Icon name="x" /></button>}
        </li>
      ))}
    </ul>
  );
}

export default function PersonalPostComposer({ account, photoId, body, type, tags, disabled, submitLabel, onBodyChange, onTypeChange, onTagsChange, onSubmit }) {
  const radioName = useId();
  const topicId = useId();
  const topicInput = useRef(null);
  const [topicDraft, setTopicDraft] = useState("");
  const [topicError, setTopicError] = useState("");
  const hasTopicDraft = Boolean(topicDraft.trim());
  const topicLimit = tags.length >= MAX_POST_TOPICS;
  const format = types.find(option => option.type === type) ?? types[0];
  const initial = (account?.person?.firstName || account?.username || "B").slice(0, 1).toUpperCase();

  function addTopic() {
    if (disabled || topicLimit || !hasTopicDraft) return;
    const topic = normalizePostTopic(topicDraft);
    if (!topic) {
      setTopicError("Enter a topic with letters or numbers, up to " + MAX_POST_TOPIC_LENGTH + " characters.");
      return;
    }
    if (tags.some(tag => tag.toLowerCase() === topic.toLowerCase())) {
      setTopicError("That topic is already added.");
      return;
    }
    onTagsChange([...tags, topic]);
    setTopicDraft("");
    setTopicError("");
    topicInput.current?.focus();
  }

  function removeTopic(tag) {
    onTagsChange(tags.filter(topic => topic !== tag));
    setTopicError("");
    topicInput.current?.focus();
  }

  function submit(event) {
    if (hasTopicDraft) {
      event.preventDefault();
      setTopicError("Add this topic before publishing.");
      return;
    }
    onSubmit(event);
  }

  return (
    <form className="bw-personal-composer" aria-label="Create a post" onSubmit={submit}>
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
          <div className="bw-post-topic-editor">
            <div className="bw-post-topic-heading">
              <label htmlFor={topicId}>Topic tags</label>
              <span id={topicId + "-hint"}>Add 1–{MAX_POST_TOPICS} topics</span>
            </div>
            <div className="bw-post-topic-entry">
              <input ref={topicInput} id={topicId} value={topicDraft} maxLength={MAX_POST_TOPIC_LENGTH + 1}
                placeholder={topicLimit ? "Topic limit reached" : "e.g. Research"} disabled={disabled} readOnly={topicLimit}
                aria-invalid={Boolean(topicError)} aria-describedby={topicId + "-hint" + (topicError ? " " + topicId + "-error" : "")}
                onChange={event => { setTopicDraft(event.target.value); setTopicError(""); }}
                onKeyDown={event => {
                  if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                  event.preventDefault();
                  addTopic();
                }} />
              <button type="button" onClick={addTopic} disabled={disabled || topicLimit || !hasTopicDraft}>Add tag</button>
            </div>
            {topicError && <p id={topicId + "-error"} className="bw-post-topic-error" role="alert">{topicError}</p>}
            <PostTopicTags tags={tags} onRemove={removeTopic} disabled={disabled} />
          </div>
          <div className="bw-personal-composer-footer">
            <span>{body.length ? body.length + " / 2,000" : ""}</span>
            <button className="bw-personal-composer-submit" type="submit" disabled={disabled || !body.trim() || !tags.length || hasTopicDraft}>{submitLabel}</button>
          </div>
        </div>
      </div>
    </form>
  );
}
