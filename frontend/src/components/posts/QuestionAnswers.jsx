import { useEffect, useId, useRef, useState } from "react";
import NavigationIcon from "../layout/NavigationIcon";
import { organizationPostsApi as api } from "../../api/organization-posts";
import DiscussionAuthor from "./DiscussionAuthor";

function countLabel(count, singular, plural) {
  return count + " " + (count === 1 ? singular : plural);
}

function AnswerComments({ answerId, commentCount = 0, onCountChange }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState(null);
  const requestKey = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (open && items) textareaRef.current?.focus();
  }, [open, items]);

  async function load() {
    if (pending) return;
    setPending(true); setError("");
    try { setItems((await api.answerComments(answerId)).items); }
    catch (err) { setError(err.message); }
    finally { setPending(false); }
  }

  async function publish(event) {
    event.preventDefault();
    if (!draft.trim() || pending) return;
    setPending(true); setError("");
    requestKey.current ??= crypto.randomUUID();
    try {
      const { comment } = await api.addAnswerComment(answerId, { body: draft, requestKey: requestKey.current });
      setItems(current => [...(current || []).filter(item => item.id !== comment.id), comment]);
      setDraft("");
      requestKey.current = null;
      onCountChange?.(1);
    } catch (err) { setError(err.message); }
    finally { setPending(false); }
  }

  async function remove(id) {
    if (pending) return;
    setPending(true); setError("");
    try {
      await api.deleteAnswerComment(answerId, id);
      setItems(current => (current || []).filter(item => item.id !== id));
      setDeleteId(null);
      onCountChange?.(-1);
    } catch (err) { setError(err.message); }
    finally { setPending(false); }
  }

  return (
    <div className="bw-answer-comments">
      <button type="button" className="bw-answer-comment-trigger" aria-expanded={open} aria-controls={panelId}
        onClick={() => { setOpen(!open); if (!open && !items) void load(); }}>
        <NavigationIcon name="reply" size={16} />
        <span>Comment</span>
        {commentCount > 0 && <span className="bw-discussion-action-count">{commentCount}</span>}
      </button>
      {open && (
        <section id={panelId} className="bw-answer-comments-panel" aria-label="Answer comments" aria-busy={pending}>
          <div className="bw-discussion-subhead">
            <strong>Replies</strong>
            <span>{countLabel(commentCount, "comment", "comments")}</span>
          </div>
          {error && <p role="alert" className="bw-post-error">{error}</p>}
          {pending && !items && <p role="status" className="bw-discussion-status">Loading replies…</p>}
          {items && (
            <>
              <ul className="bw-discussion-list bw-discussion-list--replies" aria-label="Answer comments">
                {items.map(comment => (
                  <li key={comment.id} className="bw-discussion-entry">
                    <DiscussionAuthor entry={comment} compact />
                    <p className="bw-discussion-entry-body">{comment.body}</p>
                    {comment.canDelete && (deleteId === comment.id ? (
                      <div className="bw-discussion-confirm">
                        <span>Delete this reply?</span>
                        <button type="button" disabled={pending} onClick={() => void remove(comment.id)}>Confirm deletion</button>
                        <button type="button" disabled={pending} onClick={() => setDeleteId(null)}>Cancel</button>
                      </div>
                    ) : (
                      <button type="button" className="bw-discussion-text-button" disabled={pending} onClick={() => setDeleteId(comment.id)}>
                        Delete comment
                      </button>
                    ))}
                  </li>
                ))}
              </ul>
              {items.length === 0 && (
                <p className="bw-discussion-empty bw-discussion-empty--small">No replies yet. Add a helpful thought.</p>
              )}
              <form className="bw-discussion-composer bw-discussion-composer--reply" onSubmit={publish}>
                <label htmlFor={panelId + "-body"}>Comment on this answer</label>
                <textarea ref={textareaRef} id={panelId + "-body"} rows={2} maxLength={1000}
                  value={draft} disabled={pending} placeholder="Add a constructive comment…"
                  onChange={e => { setDraft(e.target.value); requestKey.current = null; }} />
                <div className="bw-discussion-composer-footer">
                  <span className="bw-discussion-character-count">{draft.length} / 1,000</span>
                  <button type="submit" className="bw-discussion-submit" disabled={!draft.trim() || pending}>
                    {pending ? "Posting…" : "Post comment"}
                  </button>
                </div>
              </form>
            </>
          )}
          {!items && !pending && <button type="button" className="bw-discussion-retry" onClick={() => void load()}>Retry comments</button>}
        </section>
      )}
    </div>
  );
}

export default function QuestionAnswers({ questionId, onClose, onCountChange, isQuestionPublisher = false }) {
  const sortId = useId();
  const [sort, setSort] = useState("top");
  const [retry, setRetry] = useState(0);
  const [items, setItems] = useState(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState(null);
  const requestKey = useRef(null);
  const active = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    api.answers(questionId, sort, controller.signal)
      .then(result => {
        if (!controller.signal.aborted) { setItems(result.items); setError(""); }
      })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => { controller.abort(); active.current = null; };
  }, [questionId, sort, retry]);

  async function publish(event) {
    event.preventDefault();
    if (isQuestionPublisher || !draft.trim() || pending) return;
    setPending(true); setError("");
    requestKey.current ??= crypto.randomUUID();
    try {
      const { answer } = await api.addAnswer(questionId, { body: draft, requestKey: requestKey.current });
      setItems(current => [answer, ...(current || []).filter(item => item.id !== answer.id)]);
      setDraft("");
      requestKey.current = null;
      onCountChange?.(1);
    } catch (err) { setError(err.message); }
    finally { setPending(false); }
  }

  async function vote(answer, value) {
    if (pending) return;
    setPending(true); setError("");
    try {
      const result = await api.voteAnswer(answer.id, answer.myVote === value ? 0 : value);
      setItems(current => current.map(item => item.id === answer.id ? { ...item, ...result } : item));
    } catch (err) { setError(err.message); }
    finally { setPending(false); }
  }

  async function remove(id) {
    if (pending) return;
    setPending(true); setError("");
    try {
      await api.deleteAnswer(id);
      setItems(current => current.filter(item => item.id !== id));
      setDeleteId(null);
      onCountChange?.(-1);
    } catch (err) { setError(err.message); }
    finally { setPending(false); }
  }

  function refresh() {
    setItems(null);
    setError("");
    setRetry(value => value + 1);
  }

  function changeSort(value) {
    setSort(value);
    setItems(null);
    setError("");
  }

  function changeCommentCount(id, delta) {
    setItems(current => current?.map(item => item.id === id
      ? { ...item, commentCount: Math.max(0, (item.commentCount ?? 0) + delta) } : item));
  }

  return (
    <section className="bw-question-answers bw-discussion-panel" aria-label="Answers">
      <header className="bw-discussion-panel-header">
        <div className="bw-discussion-panel-heading">
          <span className="bw-discussion-panel-icon"><NavigationIcon name="reply" size={20} /></span>
          <div>
            <strong>Community answers</strong>
            <p>{isQuestionPublisher
              ? "Read the responses to your question and join the discussion by commenting on answers."
              : "Share what you know. Helpful answers rise through member voting."}</p>
          </div>
        </div>
        <button type="button" className="bw-discussion-close" aria-label="Close answers" onClick={onClose}>×</button>
      </header>

      {!isQuestionPublisher && <form className="bw-question-answer-form bw-discussion-composer" onSubmit={publish}>
        <label htmlFor={"answer-" + questionId}>Your answer</label>
        <textarea id={"answer-" + questionId} rows={4} maxLength={2000} value={draft} disabled={pending}
          placeholder="Share your knowledge, experience, or a practical solution…"
          onChange={event => { setDraft(event.target.value); requestKey.current = null; }} />
        <div className="bw-discussion-composer-footer">
          <span className="bw-discussion-character-count">{draft.length} / 2,000</span>
          <button type="submit" className="bw-discussion-submit" disabled={!draft.trim() || pending}>
            <NavigationIcon name="post" size={16} />
            {pending ? "Publishing…" : "Publish answer"}
          </button>
        </div>
      </form>}

      {error && <p className="bw-post-error" role="alert">{error}</p>}
      <div className="bw-discussion-toolbar">
        <div className="bw-discussion-toolbar-title">
          <strong>Answers</strong>
          {items && <span className="bw-discussion-count">{items.length}</span>}
        </div>
        <div className="bw-answer-sort">
          <label htmlFor={sortId}>Sort answers</label>
          <select id={sortId} value={sort} onChange={e => changeSort(e.target.value)}>
            <option value="top">Highest score</option>
            <option value="newest">Newest first</option>
          </select>
        </div>
      </div>
      {!items && !error && <p className="bw-discussion-status" role="status">Loading answers…</p>}
      {!items && error && <button type="button" className="bw-discussion-retry" onClick={refresh}>Retry loading answers</button>}
      {items?.length === 0 && (
        <div className="bw-discussion-empty">
          <span className="bw-discussion-empty-icon"><NavigationIcon name="reply" size={23} /></span>
          <strong>{isQuestionPublisher ? "No answers yet" : "Be the first to answer"}</strong>
          <p>{isQuestionPublisher
            ? "Responses from other members will appear here when they answer your question."
            : "Your experience could help someone move forward."}</p>
        </div>
      )}
      {items?.length > 0 && (
        <ul className="bw-answer-list" aria-label="Answers">
          {items.map(answer => (
            <li key={answer.id} className="bw-answer-card">
              <DiscussionAuthor entry={answer} />
              <p className="bw-discussion-entry-body bw-answer-body">{answer.body}</p>
              <div className="bw-answer-actions">
                <div className="bw-answer-vote-group" role="group" aria-label={"Voting on answer by " + (answer.name || answer.username)}>
                  <button type="button" aria-label={"Upvote answer by " + answer.username}
                    aria-pressed={answer.myVote === 1} disabled={pending || answer.canDelete} onClick={() => void vote(answer, 1)}>
                    <NavigationIcon name="upvote" active={answer.myVote === 1} size={18} />
                    <span className="bw-answer-vote-count" aria-label={"Upvotes " + (answer.upvoteCount ?? 0)}>{answer.upvoteCount ?? 0}</span>
                  </button>
                  <span className="bw-answer-vote-divider" aria-hidden="true" />
                  <button type="button" aria-label={"Downvote answer by " + answer.username}
                    aria-pressed={answer.myVote === -1} disabled={pending || answer.canDelete} onClick={() => void vote(answer, -1)}>
                    <NavigationIcon name="downvote" active={answer.myVote === -1} size={18} />
                    <span className="bw-answer-vote-count" aria-label={"Downvotes " + (answer.downvoteCount ?? 0)}>{answer.downvoteCount ?? 0}</span>
                  </button>
                </div>
                <AnswerComments answerId={answer.id} commentCount={answer.commentCount}
                  onCountChange={delta => changeCommentCount(answer.id, delta)} />
                {answer.canDelete && (deleteId === answer.id ? (
                  <span className="bw-discussion-confirm">
                    <span>Delete your answer?</span>
                    <button type="button" disabled={pending} onClick={() => void remove(answer.id)}>Confirm deletion</button>
                    <button type="button" disabled={pending} onClick={() => setDeleteId(null)}>Cancel</button>
                  </span>
                ) : (
                  <button type="button" className="bw-discussion-text-button bw-discussion-delete"
                    disabled={pending} onClick={() => setDeleteId(answer.id)}>Delete answer</button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
