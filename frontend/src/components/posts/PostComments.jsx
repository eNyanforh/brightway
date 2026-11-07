import { useEffect, useId, useRef, useState } from "react";
import NavigationIcon from "../layout/NavigationIcon";
import { organizationPostsApi as api } from "../../api/organization-posts";

const time = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export default function PostComments({ source, postId, children, showComment = true, primaryAction = null }) {
  const regionId = useId();
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(null);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState(null);
  const active = useRef(null);
  const requestKey = useRef(null);

  useEffect(() => () => active.current?.abort(), []);

  async function run(operation, receive) {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    const { signal } = controller;
    setPending(true);
    setError("");
    try {
      const data = await operation(signal);
      if (!signal.aborted) receive(data);
    } catch (failure) {
      if (!signal.aborted) {
        if (failure.status === 401 || failure.status === 404) setPage(null);
        setError(failure.message);
      }
    } finally {
      if (!signal.aborted) setPending(false);
      active.current = null;
    }
  }

  function load(cursor) {
    void run(signal => api.comments(source, postId, cursor, signal), data => {
      setPage(previous => cursor && previous ? { ...data, items: [...previous.items, ...data.items] } : data);
    });
  }

  function toggle() {
    setExpanded(!expanded);
    if (!expanded) {
      setPage(null);
      load();
    }
  }

  function publish(event) {
    event.preventDefault();
    if (!body.trim() || active.current) return;
    requestKey.current ??= crypto.randomUUID();
    const draft = { body, requestKey: requestKey.current };
    void run(signal => api.addComment(source, postId, draft, signal), ({ comment }) => {
      setPage(previous => ({ ...previous, items: [comment, ...previous.items.filter(item => item.id !== comment.id)] }));
      requestKey.current = null;
      setBody("");
    });
  }

  function remove(id) {
    void run(signal => api.deleteComment(source, postId, id, signal), () => {
      setPage(previous => ({ ...previous, items: previous.items.filter(item => item.id !== id) }));
      setDeleteId(null);
    });
  }

  return (
    <div className="bw-post-comments">
      <div className={primaryAction ? "bw-timeline-actions bw-timeline-actions--split" : "bw-timeline-actions"}>
        {primaryAction && <div className="bw-post-primary-action">{primaryAction}</div>}
        <div className={primaryAction ? "bw-post-secondary-actions" : "bw-post-secondary-actions bw-post-secondary-actions--default"}>
          {showComment && (
            <button type="button" className="bw-timeline-action" aria-label="Comments" title="Comments"
              aria-expanded={expanded} aria-controls={regionId} disabled={pending} onClick={toggle}>
              <NavigationIcon name="reply" size={19} />
            </button>
          )}
          {children}
        </div>
      </div>
      {showComment && <section id={regionId} hidden={!expanded} aria-label="Post comments">
        {error && <p className="bw-post-error" role="alert">{error}</p>}
        {!page && pending && <p role="status">Loading comments…</p>}
        {!page && error && <button type="button" onClick={() => load()}>Retry comments</button>}
        {page && (
          <>
            <form onSubmit={publish}>
              <label htmlFor={regionId + "-body"}>Write a comment</label>
              <textarea id={regionId + "-body"} rows={2} maxLength={1000} value={body} disabled={pending}
                onChange={event => { requestKey.current = null; setBody(event.target.value); }} />
              <button type="submit" disabled={!body.trim() || pending}>Post comment</button>
            </form>
            {page.items.length === 0 && <p>No comments yet.</p>}
            {page.items.length > 0 && <ul aria-label="Comments">
              {page.items.map(comment => (
                <li key={comment.id}>
                  <div className="bw-post-comment-meta"><strong>@{comment.username}</strong> <time dateTime={comment.createdAt}>{time.format(new Date(comment.createdAt))}</time></div>
                  <p className="bw-post-text">{comment.body}</p>
                  {comment.canDelete && (deleteId === comment.id ? (
                    <div className="bw-post-actions">
                      <button type="button" disabled={pending} onClick={() => remove(comment.id)}>Confirm deletion</button>
                      <button type="button" disabled={pending} onClick={() => setDeleteId(null)}>Cancel</button>
                    </div>
                  ) : <button type="button" disabled={pending} onClick={() => setDeleteId(comment.id)}>Delete comment</button>)}
                </li>
              ))}
            </ul>}
            {page.nextCursor && <button type="button" disabled={pending} onClick={() => load(page.nextCursor)}>Load older comments</button>}
          </>
        )}
      </section>}
    </div>
  );
}
