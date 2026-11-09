import { useEffect, useId, useRef, useState } from "react";
import NavigationIcon from "../layout/NavigationIcon";
import { organizationPostsApi as api } from "../../api/organization-posts";
import DiscussionAuthor from "./DiscussionAuthor";

export default function PostComments({ source, postId, children, showComment = true, primaryAction = null, commentCount = null }) {
  const regionId = useId();
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(null);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState(null);
  const active = useRef(null);
  const requestKey = useRef(null);
  const input = useRef(null);

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
      setPage(previous => cursor && previous
        ? { ...data, items: [...previous.items, ...data.items] }
        : data);
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
      setPage(previous => ({
        ...previous,
        items: [comment, ...previous.items.filter(item => item.id !== comment.id)],
      }));
      requestKey.current = null;
      setBody("");
      input.current?.focus();
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
              {Number.isInteger(commentCount) && <span className="bw-action-count" aria-label={commentCount + " comments"}>{commentCount.toLocaleString()}</span>}
            </button>
          )}
          {children}
        </div>
      </div>
      {showComment && (
        <section id={regionId} className="bw-post-comments-section bw-discussion-panel"
          hidden={!expanded} aria-label="Post comments" aria-busy={pending}>
          <header className="bw-discussion-panel-header">
            <div className="bw-discussion-panel-heading">
              <span className="bw-discussion-panel-icon"><NavigationIcon name="reply" size={19} /></span>
              <div>
                <strong>Comments</strong>
                <p>Join the conversation with a helpful response.</p>
              </div>
            </div>
            <button type="button" className="bw-discussion-close" aria-label="Close comments"
              disabled={pending} onClick={toggle}>×</button>
          </header>
          {error && <p className="bw-post-error" role="alert">{error}</p>}
          {!page && pending && <p role="status" className="bw-discussion-status">Loading comments…</p>}
          {!page && error && <button type="button" className="bw-discussion-retry" onClick={() => load()}>Retry comments</button>}
          {page && (
            <>
              <form className="bw-discussion-composer bw-post-comment-form" onSubmit={publish}>
                <label htmlFor={regionId + "-body"}>Write a comment</label>
                <textarea ref={input} id={regionId + "-body"} rows={3} maxLength={1000}
                  placeholder="Share a thoughtful comment…"
                  value={body} disabled={pending}
                  onChange={event => { requestKey.current = null; setBody(event.target.value); }} />
                <div className="bw-discussion-composer-footer">
                  <span className="bw-discussion-character-count">{body.length} / 1,000</span>
                  <button type="submit" className="bw-discussion-submit" disabled={!body.trim() || pending}>
                    <NavigationIcon name="reply" size={16} />
                    {pending ? "Posting…" : "Post comment"}
                  </button>
                </div>
              </form>
              <div className="bw-discussion-toolbar">
                <div className="bw-discussion-toolbar-title">
                  <strong>Conversation</strong>
                  <span className="bw-discussion-count">{page.items.length}</span>
                </div>
                {page.nextCursor && <span className="bw-discussion-pagination-label">More comments available</span>}
              </div>
              {page.items.length === 0 ? (
                <div className="bw-discussion-empty">
                  <span className="bw-discussion-empty-icon"><NavigationIcon name="reply" size={22} /></span>
                  <strong>Start the conversation</strong>
                  <p>Be the first to leave a thoughtful comment.</p>
                </div>
              ) : (
                <ul className="bw-discussion-list" aria-label="Comments">
                  {page.items.map(comment => (
                    <li key={comment.id} className="bw-discussion-entry">
                      <DiscussionAuthor entry={comment} />
                      <p className="bw-discussion-entry-body">{comment.body}</p>
                      {comment.canDelete && (deleteId === comment.id ? (
                        <div className="bw-discussion-confirm">
                          <span>Delete this comment?</span>
                          <button type="button" disabled={pending} onClick={() => remove(comment.id)}>Confirm deletion</button>
                          <button type="button" disabled={pending} onClick={() => setDeleteId(null)}>Cancel</button>
                        </div>
                      ) : (
                        <button type="button" className="bw-discussion-text-button" disabled={pending}
                          onClick={() => setDeleteId(comment.id)}>Delete comment</button>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
              {page.nextCursor && (
                <button type="button" className="bw-discussion-load-more" disabled={pending}
                  onClick={() => load(page.nextCursor)}>
                  {pending ? "Loading…" : "View older comments"}
                </button>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
