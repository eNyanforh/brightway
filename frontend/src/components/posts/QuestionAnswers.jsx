import { useEffect, useRef, useState } from "react";
import NavigationIcon from "../layout/NavigationIcon";
import { organizationPostsApi as api } from "../../api/organization-posts";

const time = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function AnswerComments({ answerId }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState(null);
  const requestKey = useRef(null);

  async function load() {
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
      setDraft(""); requestKey.current = null;
    } catch (err) { setError(err.message); }
    finally { setPending(false); }
  }

  async function remove(id) {
    setPending(true); setError("");
    try {
      await api.deleteAnswerComment(answerId, id);
      setItems(current => current.filter(item => item.id !== id));
      setDeleteId(null);
    } catch (err) { setError(err.message); }
    finally { setPending(false); }
  }

  return (
    <div className="bw-answer-comments">
      <button type="button" className="bw-answer-comment-trigger" aria-expanded={open}
        onClick={() => { setOpen(!open); if (!open && !items) void load(); }}>
        <NavigationIcon name="reply" size={15} /> Comment
      </button>
      {open && (
        <div className="bw-answer-comments-panel">
          {error && <p role="alert" className="bw-post-error">{error}</p>}
          {pending && !items && <p role="status">Loading answer comments…</p>}
          {items && (
            <>
              <form onSubmit={publish}>
                <label>Comment on this answer
                  <textarea rows={2} maxLength={1000} value={draft} disabled={pending}
                    onChange={e => { setDraft(e.target.value); requestKey.current = null; }} />
                </label>
                <button type="submit" disabled={!draft.trim() || pending}>Post comment</button>
              </form>
              {items.length === 0 && <p>No comments on this answer yet.</p>}
              <ul aria-label="Answer comments">
                {items.map(comment => (
                  <li key={comment.id}>
                    <strong>@{comment.username}</strong> <time dateTime={comment.createdAt}>{time.format(new Date(comment.createdAt))}</time>
                    <p>{comment.body}</p>
                    {comment.canDelete && (deleteId === comment.id ?
                      <span className="bw-answer-comment-confirm">
                        <button type="button" disabled={pending} onClick={() => void remove(comment.id)}>Confirm deletion</button>
                        <button type="button" disabled={pending} onClick={() => setDeleteId(null)}>Cancel</button>
                      </span> :
                      <button type="button" disabled={pending} onClick={() => setDeleteId(comment.id)}>Delete comment</button>)}
                  </li>
                ))}
              </ul>
            </>
          )}
          {!items && !pending && <button type="button" onClick={() => void load()}>Retry comments</button>}
        </div>
      )}
    </div>
  );
}

export default function QuestionAnswers({ questionId, onClose, onCountChange }) {
  const [sort, setSort] = useState("top");
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
        if (!controller.signal.aborted) { setItems(result.items); setError(""); onCountChange?.(result.items.length); }
      })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => { controller.abort(); active.current = null; };
  }, [questionId, sort, onCountChange]);

  async function publish(event) {
    event.preventDefault();
    if (!draft.trim() || pending) return;
    setPending(true); setError("");
    requestKey.current ??= crypto.randomUUID();
    try {
      const { answer } = await api.addAnswer(questionId, { body: draft, requestKey: requestKey.current });
      setItems(current => {
        const next = [answer, ...(current || []).filter(item => item.id !== answer.id)];
        onCountChange?.(next.length);
        return next;
      });
      setDraft(""); requestKey.current = null;
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
    setPending(true); setError("");
    try {
      await api.deleteAnswer(id);
      setItems(current => {
        const next = current.filter(item => item.id !== id);
        onCountChange?.(next.length);
        return next;
      });
      setDeleteId(null);
    } catch (err) { setError(err.message); }
    finally { setPending(false); }
  }

  return (
    <section className="bw-question-answers" aria-label="Answers">
      <header>
        <div><strong>Community answers</strong><p>Helpful answers rise through member voting.</p></div>
        <button type="button" aria-label="Close answers" onClick={onClose}>×</button>
      </header>
      <form className="bw-question-answer-form" onSubmit={publish}>
        <label htmlFor={"answer-" + questionId}>Your answer</label>
        <textarea id={"answer-" + questionId} rows={4} maxLength={2000} value={draft} disabled={pending}
          placeholder="Share an explanation, your experience, or a practical solution…"
          onChange={event => { setDraft(event.target.value); requestKey.current = null; }} />
        <button type="submit" disabled={!draft.trim() || pending}>Publish answer</button>
      </form>
      {error && <p className="bw-post-error" role="alert">{error}</p>}
      <div className="bw-answer-sort">
        <label htmlFor={"sort-" + questionId}>Sort answers</label>
        <select id={"sort-" + questionId} value={sort} onChange={e => { setSort(e.target.value); setItems(null); }}>
          <option value="top">Highest score</option><option value="newest">Newest first</option>
        </select>
      </div>
      {!items && !error && <p role="status">Loading answers…</p>}
      {!items && error && <button type="button" onClick={() => setSort(value => value === "top" ? "newest" : "top")}>Retry loading answers</button>}
      {items?.length === 0 && <p>No answers yet. Be the first to help.</p>}
      {items?.length > 0 && <ul className="bw-answer-list" aria-label="Answers">
        {items.map(answer => (
          <li key={answer.id} className="bw-answer-card">
            <div className="bw-answer-meta"><strong>@{answer.username}</strong><time dateTime={answer.createdAt}>{time.format(new Date(answer.createdAt))}</time></div>
            <p className="bw-post-text">{answer.body}</p>
            <div className="bw-answer-actions">
              <button type="button" aria-label={"Upvote answer by " + answer.username}
                aria-pressed={answer.myVote === 1} disabled={pending} onClick={() => void vote(answer, 1)}>
                <NavigationIcon name="upvote" active={answer.myVote === 1} size={19} />
              </button>
              <span aria-label={"Answer score " + answer.score}>{answer.score}</span>
              <button type="button" aria-label={"Downvote answer by " + answer.username}
                aria-pressed={answer.myVote === -1} disabled={pending} onClick={() => void vote(answer, -1)}>
                <NavigationIcon name="downvote" active={answer.myVote === -1} size={19} />
              </button>
              <AnswerComments answerId={answer.id} />
              {answer.canDelete && (deleteId === answer.id ?
                <span className="bw-answer-comment-confirm">
                  <button type="button" disabled={pending} onClick={() => void remove(answer.id)}>Confirm deletion</button>
                  <button type="button" disabled={pending} onClick={() => setDeleteId(null)}>Cancel</button>
                </span> :
                <button type="button" disabled={pending} onClick={() => setDeleteId(answer.id)}>Delete answer</button>)}
            </div>
          </li>
        ))}
      </ul>}
    </section>
  );
}
