import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { organizationPostsApi as api } from "../../api/organization-posts";
import "./posts.css";

const time = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function PostCard({ post, editable, busy, onWithdraw }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <article className="bw-post-card">
      <header>
        <span className="bw-post-badge" aria-hidden="true">{post.organization.name.slice(0, 1).toUpperCase()}</span>
        <div>
          <Link to={"/organizations/" + post.organization.id}>{post.organization.name}</Link>
          <p><time dateTime={post.createdAt}>{time.format(new Date(post.createdAt))}</time></p>
        </div>
      </header>
      <p className="bw-post-text">{post.body}</p>
      {editable && (
        confirming ? <div className="bw-post-actions">
          <span>Withdraw this post from Explore?</span>
          <button type="button" disabled={busy} onClick={() => onWithdraw(post.id)}>Confirm withdrawal</button>
          <button type="button" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
        </div> : <button type="button" className="bw-post-quiet" disabled={busy} onClick={() => setConfirming(true)}>Withdraw post</button>
      )}
    </article>
  );
}

export default function PostsPanel({ organization, view = "for-you", disabled = false }) {
  const organizationId = organization?.id;
  const [page, setPage] = useState(null);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState("");
  const active = useRef(null);
  const publishKey = useRef(null);

  const run = useCallback(async (operation, receive) => {
    if (active.current) return;
    const controller = new AbortController();
    const { signal } = controller;
    active.current = controller;
    setPending(true);
    try {
      const data = await operation(signal);
      if (!signal.aborted) {
        receive(data);
        setError(null);
      }
    } catch (failure) {
      if (!signal.aborted) {
        if ([401, 403, 404].includes(failure.status)) setPage(null);
        setError(failure);
      }
    } finally {
      if (active.current === controller) {
        active.current = null;
        setPending(false);
      }
    }
  }, []);

  const load = useCallback(cursor => run(
    signal => organizationId ? api.list(organizationId, cursor, signal) : api.feed(view, cursor, signal),
    data => setPage(previous => cursor && previous
      ? { ...data, items: [...previous.items, ...data.items] }
      : data),
  ), [organizationId, run, view]);

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => { if (mounted) void load(); });
    return () => {
      mounted = false;
      active.current?.abort();
      active.current = null;
    };
  }, [load]);

  function publish(event) {
    event.preventDefault();
    if (!page || !body.trim() || disabled || active.current) return;
    setNotice("");
    publishKey.current ??= crypto.randomUUID();
    void run(signal => api.publish(organizationId, { body, requestKey: publishKey.current }, signal), ({ post }) => {
      setPage(previous => ({ ...previous, items: [post, ...previous.items.filter(item => item.id !== post.id)] }));
      publishKey.current = null;
      setBody("");
      setNotice("Post published.");
    });
  }

  function withdraw(id) {
    if (!page || disabled || active.current) return;
    setNotice("");
    void run(signal => api.withdraw(organizationId, id, signal), () => {
      setPage(previous => ({ ...previous, items: previous.items.filter(item => item.id !== id) }));
      setNotice("Post withdrawn.");
    });
  }

  return (
    <section className="bw-post-panel" aria-label={organization ? "Organization posts" : "Explore posts"}>
      {organization && (
        <form className="bw-post-card bw-post-form" onSubmit={publish}>
          <h2>Posts</h2>
          <p>Publish as <strong>{organization.name}</strong>.</p>
          <label htmlFor="organization-post-body">Write an organization post</label>
          <textarea id="organization-post-body" rows={5} maxLength={2000} value={body} disabled={pending || disabled}
            onChange={event => { publishKey.current = null; setBody(event.target.value); }} />
          <div className="bw-post-actions">
            <button type="submit" className="bw-post-primary" disabled={!page || !body.trim() || pending || disabled}>Publish post</button>
            <span>{body.length} / 2,000</span>
          </div>
        </form>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && <p className="bw-post-error" role="alert">{error.message}</p>}
      {!page && !error && <p role="status">Loading posts…</p>}
      <div className="bw-post-actions">
        <button type="button" disabled={pending || disabled} onClick={() => void load()}>Refresh posts</button>
      </div>
      {page?.items.length === 0 && (
        <p className="bw-post-empty">{organization ? "Your organization has no published posts yet." :
          view === "following" ? "Posts from organizations you follow will appear here." : "Organization posts will appear here as they are published."}</p>
      )}
      {page?.items.map(post => <PostCard key={post.id} post={post} editable={Boolean(organization)} busy={pending || disabled} onWithdraw={withdraw} />)}
      {page?.nextCursor && <button type="button" disabled={pending || disabled} onClick={() => void load(page.nextCursor)}>Load older posts</button>}
    </section>
  );
}
