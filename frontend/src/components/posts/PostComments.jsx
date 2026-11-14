import { useCallback, useEffect, useId, useRef, useState } from "react";
import NavigationIcon from "../layout/NavigationIcon";
import { organizationPostsApi as api } from "../../api/organization-posts";
import DiscussionAuthor from "./DiscussionAuthor";

export default function PostComments({ source, postId, children, inline = false, showComment = true, primaryAction = null, commentCount = null, engagementPreview = null, onEngagementChange }) {
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

  useEffect(() => () => {
    active.current?.abort();
    active.current = null;
  }, []);

  const run = useCallback(async (operation, receive) => {
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
      if (active.current === controller) {
        active.current = null;
        if (!signal.aborted) setPending(false);
      }
    }
  }, []);

  const load = useCallback(cursor => {
    void run(signal => api.comments(source, postId, cursor, signal), data => {
      setPage(previous => cursor && previous
        ? { ...data, items: [...previous.items, ...data.items] }
        : data);
    });
  }, [source, postId, run]);

  useEffect(() => {
    if (!inline || !showComment) return;
    let mounted = true;
    queueMicrotask(() => { if (mounted) load(); });
    return () => { mounted = false; };
  }, [inline, showComment, load]);

  function toggle() {
    if (inline) {
      input.current?.focus();
      return;
    }
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
        items: [comment, ...(previous?.items ?? []).filter(item => item.id !== comment.id)],
      }));
      requestKey.current = null;
      setBody("");
      input.current?.focus();
      onEngagementChange?.();
    });
  }

  function remove(id) {
    void run(signal => api.deleteComment(source, postId, id, signal), () => {
      setPage(previous => ({ ...previous, items: previous.items.filter(item => item.id !== id) }));
      setDeleteId(null);
      onEngagementChange?.();
    });
  }

  return (
    <div className="bw-post-comments">
      <div className={"bw-timeline-actions" + (primaryAction ? " bw-timeline-actions--split" : "") + (engagementPreview ? " bw-timeline-actions--engagement" : "")}>
        {engagementPreview && <div className="bw-post-engagement-left">{engagementPreview}</div>}
        {primaryAction && <div className="bw-post-primary-action">{primaryAction}</div>}
        <div className={"bw-post-secondary-actions" + (!primaryAction && !engagementPreview ? " bw-post-secondary-actions--default" : "")}>
          {showComment && (
            <button type="button" className="bw-timeline-action" aria-label="Comments" title="Comments"
              aria-expanded={inline ? undefined : expanded} aria-controls={regionId} disabled={pending} onClick={toggle}>
              <NavigationIcon name="reply" size={19} />
              {Number.isInteger(commentCount) && <span className="bw-action-count" aria-label={commentCount + " comments"}>{commentCount.toLocaleString()}</span>}
            </button>
          )}
          {children}
        </div>
      </div>
      {showComment && (
        <section id={regionId} className="bw-post-comments-section bw-discussion-panel"
          hidden={!inline && !expanded} aria-label="Post comments" aria-busy={pending}>
          {!inline && <header className="bw-discussion-panel-header">
            <div className="bw-discussion-panel-heading">
              <span className="bw-discussion-panel-icon"><NavigationIcon name="reply" size={19} /></span>
              <div>
                <strong>Comments</strong>
                <p>Join the conversation with a helpful response.</p>
              </div>
            </div>
            <button type="button" className="bw-discussion-close" aria-label="Close comments"
              disabled={pending} onClick={toggle}>×</button>
          </header>}
          {error && <p className="bw-post-error" role="alert">{error}</p>}
          {!page && pending && <p role="status" className="bw-discussion-status">Loading comments…</p>}
          {!page && error && <button type="button" className="bw-discussion-retry" onClick={() => load()}>Retry comments</button>}
          {(inline || page) && (
            <form className={"bw-discussion-composer bw-post-comment-form" + (inline ? " bw-viewer-comment-form" : "")} onSubmit={publish}>
              <label htmlFor={regionId + "-body"}>Write a comment</label>
              <textarea ref={input} id={regionId + "-body"} rows={inline ? 1 : 3} maxLength={1000}
                placeholder={inline ? "Add a comment…" : "Share a thoughtful comment…"}
                value={body} disabled={pending}
                onChange={event => { requestKey.current = null; setBody(event.target.value); }} />
              <div className="bw-discussion-composer-footer">
                <span className="bw-discussion-character-count">{body.length} / 1,000</span>
                <button type="submit" className="bw-discussion-submit" aria-label={inline ? "Post comment" : undefined} title={inline ? "Post comment" : undefined} disabled={!body.trim() || pending}>
                  <NavigationIcon name={inline ? "share" : "reply"} size={inline ? 20 : 16} />
                  {!inline && (pending ? "Posting…" : "Post comment")}
                </button>
              </div>
            </form>
          )}
          {page && (
            <>
              {(!inline || page.items.length > 0) && <div className="bw-discussion-toolbar">
                <div className="bw-discussion-toolbar-title">
                  <strong>Conversation</strong>
                  <span className="bw-discussion-count">{page.items.length}</span>
                </div>
                {page.nextCursor && <span className="bw-discussion-pagination-label">More comments available</span>}
              </div>}
              {page.items.length === 0 ? (!inline &&
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
