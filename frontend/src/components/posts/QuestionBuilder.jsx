import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MAX_POST_TOPICS, MAX_POST_TOPIC_LENGTH, normalizePostTopic } from "../../../../shared/post-topics.mjs";
import NavigationIcon from "../layout/NavigationIcon";

const subjects = ["Coding", "Education", "Science", "Art", "Design", "Technology", "Research", "Business", "Engineering", "Health", "Career", "Entrepreneurship"];
const intents = [
  { id: "EXPLANATION", label: "Understand a concept", detail: "I need something explained" },
  { id: "FEEDBACK", label: "Get feedback", detail: "Review my work or approach" },
  { id: "GUIDANCE", label: "Find guidance", detail: "Help me take the next step" },
  { id: "DISCUSSION", label: "Start a discussion", detail: "Explore different perspectives" },
];

export default function QuestionBuilder({ body, tags, disabled, onBodyChange, onTagsChange, onCancel, onSubmit, triggerRef }) {
  const uid = useId();
  const modalRef = useRef(null);
  const titleRef = useRef(null);
  const handlerRef = useRef({ disabled, onCancel });
  const [title, setTitle] = useState("");
  const [intent, setIntent] = useState("GUIDANCE");
  const [topicDraft, setTopicDraft] = useState("");
  const [topicError, setTopicError] = useState("");
  const maxed = tags.length >= MAX_POST_TOPICS;
  const valid = !disabled && title.trim().length >= 10 && body.trim().length >= 10 && tags.length > 0 && !topicDraft.trim();

  useEffect(() => { handlerRef.current = { disabled, onCancel }; }, [disabled, onCancel]);

  useEffect(() => {
    titleRef.current?.focus();
    const trigger = triggerRef?.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!handlerRef.current.disabled) handlerRef.current.onCancel();
        return;
      }
      if (event.key !== "Tab" || !modalRef.current) return;
      const targets = [...modalRef.current.querySelectorAll("button:not(:disabled), input:not(:disabled), textarea:not(:disabled)")]
        .filter(node => node.getClientRects().length);
      if (!targets.length) return;
      if (event.shiftKey && (document.activeElement === targets[0] || !modalRef.current.contains(document.activeElement))) {
        event.preventDefault(); targets.at(-1).focus();
      } else if (!event.shiftKey && (document.activeElement === targets.at(-1) || !modalRef.current.contains(document.activeElement))) {
        event.preventDefault(); targets[0].focus();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [triggerRef]);

  function addTopic(raw) {
    if (disabled || maxed) return;
    const tag = normalizePostTopic(raw);
    if (!tag) {
      setTopicError("Use a subject with letters or numbers, up to " + MAX_POST_TOPIC_LENGTH + " characters.");
      return;
    }
    if (tags.some(existing => existing.toLowerCase() === tag.toLowerCase())) {
      setTopicError("That topic is already added.");
      return;
    }
    onTagsChange([...tags, tag]);
    setTopicDraft("");
    setTopicError("");
  }

  function submit(event) {
    event.preventDefault();
    if (!valid) return;
    onSubmit(event, undefined, { title: title.trim(), intent });
  }

  return createPortal(
    <div className="bw-question-overlay bw-post-panel" onMouseDown={event => {
      if (event.target === event.currentTarget && !disabled) onCancel();
    }}>
      <div className="bw-question-dialog" role="dialog" aria-modal="true" aria-label="Ask a Question" ref={modalRef}>
        <form className="bw-question-builder" aria-label="Create a post" onSubmit={submit}>
          <header className="bw-question-builder-header">
            <div>
              <span className="bw-question-kicker"><NavigationIcon name="question" size={16} /> BRIGHTWAY QUESTIONS</span>
              <h2>Ask the community</h2>
              <p>Make your question clear so people can give you useful answers.</p>
            </div>
            <button type="button" className="bw-question-close" aria-label="Close editor" disabled={disabled} onClick={onCancel}>×</button>
          </header>

          <div className="bw-question-builder-body">
            <section className="bw-question-fieldset" aria-label="Your question">
              <div className="bw-question-step"><span>01</span><h3>What would you like to know?</h3></div>
              <label htmlFor={uid + "-title"}>Question title</label>
              <input id={uid + "-title"} ref={titleRef} maxLength={180} minLength={10} required disabled={disabled}
                value={title} onChange={event => setTitle(event.target.value)}
                placeholder="e.g. How do I deploy my first React application?" />
              <div className="bw-question-field-hint"><span>Ask one specific question.</span><span>{title.length}/180</span></div>

              <label htmlFor={uid + "-context"}>Give some context</label>
              <textarea id={uid + "-context"} aria-label="Write a question" required rows={5} maxLength={2000}
                disabled={disabled} value={body} onChange={event => onBodyChange(event.target.value)}
                placeholder="What have you tried? What are you trying to accomplish? Where are you stuck?" />
              <div className="bw-question-field-hint"><span>Include relevant details, without sharing private information.</span><span>{body.length}/2,000</span></div>
            </section>

            <section className="bw-question-fieldset" aria-label="Help requested">
              <div className="bw-question-step"><span>02</span><h3>What kind of help do you need?</h3></div>
              <div className="bw-question-intents" role="group" aria-label="Question type">
                {intents.map(item => (
                  <button type="button" key={item.id} aria-pressed={intent === item.id} disabled={disabled}
                    onClick={() => setIntent(item.id)}>
                    <strong>{item.label}</strong><small>{item.detail}</small>
                  </button>
                ))}
              </div>
            </section>

            <section className="bw-question-fieldset" aria-label="Question topics">
              <div className="bw-question-step"><span>03</span><h3>Choose relevant topics</h3><span className="bw-question-topic-count">{tags.length}/{MAX_POST_TOPICS}</span></div>
              <p>Choose subjects such as Coding, Art, or Education to help the right people find your question.</p>
              <div className="bw-question-topic-input">
                <input aria-label="Topic tags" value={topicDraft} maxLength={MAX_POST_TOPIC_LENGTH + 1}
                  disabled={disabled || maxed} placeholder={maxed ? "Topic limit reached" : "Search or add another topic"}
                  onChange={event => { setTopicDraft(event.target.value); setTopicError(""); }}
                  onKeyDown={event => {
                    if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); addTopic(topicDraft); }
                  }} />
                <button type="button" disabled={!topicDraft.trim() || disabled || maxed} onClick={() => addTopic(topicDraft)}>Add tag</button>
              </div>
              {topicError && <p className="bw-question-error" role="alert">{topicError}</p>}
              <ul className="bw-question-selected" aria-label="Selected topic tags">
                {tags.map(tag => <li key={tag}>{tag}<button type="button" aria-label={"Remove tag " + tag}
                  disabled={disabled} onClick={() => onTagsChange(tags.filter(value => value !== tag))}>×</button></li>)}
              </ul>
              <span className="bw-question-suggestions-label">Popular subjects</span>
              <div className="bw-question-suggestions">
                {subjects.filter(item => !tags.some(tag => tag.toLowerCase() === item.toLowerCase())).map(item =>
                  <button type="button" key={item} disabled={disabled || maxed} onClick={() => addTopic(item)}>
                    <span aria-hidden="true">+</span> {item}
                  </button>)}
              </div>
            </section>

            <aside className="bw-question-preview" aria-label="Question preview">
              <span className="bw-question-preview-label">HOW YOUR QUESTION WILL APPEAR</span>
              <span className="bw-question-preview-category"><NavigationIcon name="question" size={14} /> Question · {intents.find(item => item.id === intent)?.label}</span>
              <h3>{title.trim() || "Your question will appear here"}</h3>
              <p>{body.trim() || "Add some context to help the community understand what you need."}</p>
              <div>{tags.map(tag => <span key={tag}>#{tag}</span>)}</div>
            </aside>
          </div>

          <footer className="bw-question-builder-footer">
            <p>Questions are shared publicly. Members can respond in the comments.</p>
            <div><button type="button" disabled={disabled} onClick={onCancel}>Cancel</button>
              <button type="submit" className="bw-question-publish" disabled={!valid}>Publish question</button></div>
          </footer>
        </form>
      </div>
    </div>, document.body
  );
}
