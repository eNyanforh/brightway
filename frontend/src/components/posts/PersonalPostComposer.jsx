import { useEffect, useId, useRef, useState } from "react";
import { MAX_POST_TOPICS, MAX_POST_TOPIC_LENGTH, normalizePostTopic } from "../../../../shared/post-topics.mjs";
import { photoUrl } from "../../api/profile";
import Icon from "../layout/Icon";
import NavigationIcon from "../layout/NavigationIcon";

const types = [
  {
    type: "ACHIEVEMENT", label: "Achievement", choice: "Share an Achievement", icon: "awards",
    editor: "Write an achievement", heading: "Celebrate your achievement",
    prompt: "What did you accomplish? Share what you learned along the way.",
    publish: "Publish achievement",
  },
  {
    type: "EVENT", label: "Event", choice: "Create an Event", icon: "calendar",
    editor: "Write an event", heading: "Create a community event",
    prompt: "Tell people what is happening. Include the date, time, location, or a joining link.",
    publish: "Publish event",
  },
  {
    type: "QUESTION", label: "Question", choice: "Ask a Question", icon: "question",
    editor: "Write a question", heading: "Ask the community",
    prompt: "What would you like to learn or understand? Give enough context for people to help.",
    publish: "Publish question",
  },
];
const legacyType = { type: "POST", label: "Post", icon: "post" };

export function PersonalPostTypeLabel({ type }) {
  const format = types.find(option => option.type === type) ?? legacyType;
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

export default function PersonalPostComposer({
  account, photoId, body, type, tags, open, disabled,
  onSelect, onCancel, onBodyChange, onTagsChange, onSubmit,
}) {
  const topicId = useId();
  const editorId = useId();
  const topicInput = useRef(null);
  const bodyInput = useRef(null);
  const [topicDraft, setTopicDraft] = useState("");
  const [topicError, setTopicError] = useState("");
  const hasTopicDraft = Boolean(topicDraft.trim());
  const topicLimit = tags.length >= MAX_POST_TOPICS;
  const format = types.find(option => option.type === type) ?? types[0];
  const isAchievement = type === "ACHIEVEMENT";
  const initial = (account?.person?.firstName || account?.username || "B").slice(0, 1).toUpperCase();

  useEffect(() => {
    if (open) bodyInput.current?.focus();
  }, [open, type]);

  function selectType(nextType) {
    if (disabled) return;
    setTopicDraft("");
    setTopicError("");
    onSelect(nextType);
  }

  function closeEditor() {
    if (disabled) return;
    setTopicDraft("");
    setTopicError("");
    onCancel();
  }

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
    // The parent closes the editor only after the server accepts the post.
  }

  return (
    <div className="bw-personal-composer" aria-label="Community contribution composer">
      <div className="bw-post-quick-actions" role="group" aria-label="Choose how to contribute">
        <div className="bw-timeline-avatar bw-post-quick-avatar" role="img" aria-label="Your profile photo">
          {photoId ? <img src={photoUrl(photoId)} alt="" /> : initial}
        </div>
        {types.map(option => (
          <button type="button" key={option.type} className="bw-post-quick-action"
            data-post-type={option.type} aria-expanded={open && type === option.type}
            aria-controls={open ? editorId : undefined} disabled={disabled}
            onClick={() => selectType(option.type)}>
            <span className="bw-post-quick-icon"><NavigationIcon name={option.icon} size={20} /></span>
            <span className="bw-post-quick-label">{option.choice}</span>
          </button>
        ))}
      </div>

      {open && (
        <form id={editorId} className={"bw-personal-composer-form" + (isAchievement ? " bw-achievement-composer" : "")} aria-label="Create a post" onSubmit={submit}>
          <div className="bw-post-editor-heading" data-post-type={format.type}>
            <span className="bw-post-editor-icon"><NavigationIcon name={format.icon} size={22} /></span>
            <div>
              <span className="bw-post-editor-eyebrow">{format.label}</span>
              <h3>{format.heading}</h3>
            </div>
            <button className="bw-post-editor-close" type="button" disabled={disabled} aria-label="Close editor" onClick={closeEditor}>
              <Icon name="x" />
            </button>
          </div>
          {isAchievement && (
            <div className="bw-achievement-intro">
              <div className="bw-achievement-intro-copy">
                <span className="bw-achievement-kicker"><NavigationIcon name="awards" size={15} /> YOUR MOMENT</span>
                <h4>Every milestone deserves to be seen.</h4>
                <p>Share what you achieved, the work behind it, and what others can learn from your journey.</p>
              </div>
              <span className="bw-achievement-trophy" aria-hidden="true"><NavigationIcon name="awards" size={43} /></span>
            </div>
          )}
          <div className={isAchievement ? "bw-achievement-writing" : undefined}>
            {isAchievement && (
              <div className="bw-achievement-writing-heading">
                <label htmlFor={editorId + "-body"}>Tell your achievement story</label>
                <span>Make it meaningful</span>
              </div>
            )}
            <textarea ref={bodyInput} id={editorId + "-body"} aria-label={format.editor} placeholder={isAchievement ? "I’m proud to share that…\n\nHere’s what I accomplished, what it took, and what I learned along the way." : format.prompt} rows={isAchievement ? 6 : 4} maxLength={2000}
              value={body} disabled={disabled} onChange={event => onBodyChange(event.target.value)} />
            {isAchievement && (
              <div className="bw-achievement-writing-foot">
                <span>Tip: Mention the milestone, the effort, and the lesson.</span>
                <span aria-label={body.length + " of 2,000 characters"}>{body.length.toLocaleString()} / 2,000</span>
              </div>
            )}
          </div>
          <div className={"bw-post-topic-editor" + (isAchievement ? " bw-achievement-topic-editor" : "")}>
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
            <span>{isAchievement ? "Your achievement will be shared with the BrightWay community." : body.length + " / 2,000"}</span>
            <div className="bw-post-editor-actions">
              <button type="button" className="bw-post-editor-cancel" disabled={disabled} onClick={closeEditor}>Cancel</button>
              <button className="bw-personal-composer-submit" type="submit" disabled={disabled || !body.trim() || !tags.length || hasTopicDraft}>{format.publish}</button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
