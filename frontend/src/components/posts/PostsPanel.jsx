import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { organizationPostsApi as api } from "../../api/organization-posts";
import PostComments from "./PostComments";
import "./posts.css";

const time = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

const postSource = post => post.organization ? "organization" : "member";
const postKey = post => postSource(post) + ":" + post.id;
const cardKey = post => post.repost ? "repost:" + post.repost.id : postKey(post);

function PostCard({ post, editable, busy, onWithdraw, onLike, onSave, onRepost }) {
  const [confirming, setConfirming] = useState(false);
  const publisher = post.organization || post.member;
  const profileUrl = post.organization ? "/organizations/" + post.organization.id : "/people/" + encodeURIComponent(post.member.username);
  return (
    <article className="bw-post-card">
      {post.repost && (
        <p className="bw-post-attribution">
          <Link to={post.repost.mine ? "/profile" : "/people/" + encodeURIComponent(post.repost.member.username)}>{post.repost.mine ? "You" : post.repost.member.name}</Link>
          {" reposted · "}
          <time dateTime={post.repost.createdAt}>{time.format(new Date(post.repost.createdAt))}</time>
        </p>
      )}
      <header>
        <span className="bw-post-badge" aria-hidden="true">{publisher.name.slice(0, 1).toUpperCase()}</span>
        <div>
          <Link to={profileUrl}>{publisher.name}</Link>
          <p><time dateTime={post.createdAt}>{time.format(new Date(post.createdAt))}</time></p>
        </div>
      </header>
      <p className="bw-post-text">{post.body}</p>
      {!editable && post.reaction && (
        <div className="bw-post-actions bw-post-reactions">
          <button type="button" aria-pressed={post.reaction.liked} disabled={busy} onClick={() => onLike(post)}>
            Like
          </button>
          <span aria-live="polite">{post.reaction.count} {post.reaction.count === 1 ? "like" : "likes"}</span>
          {typeof post.reposted === "boolean" && (
            <button type="button" disabled={busy} onClick={() => onRepost(post)}>
              {post.reposted ? "Undo repost" : "Repost"}
            </button>
          )}
          {typeof post.saved === "boolean" && (
            <button type="button" aria-label="Save post" aria-pressed={post.saved} disabled={busy} onClick={() => onSave(post)}>
              {post.saved ? "Saved" : "Save"}
            </button>
          )}
        </div>
      )}
      {!editable && <PostComments postId={post.id} source={postSource(post)} />}
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

export default function PostsPanel({ organization, personal = false, view = "for-you", disabled = false }) {
  const organizationId = organization?.id;
  const editable = Boolean(organization) || personal;
  const [page, setPage] = useState(null);
  const canPublish = Boolean(page) && !disabled && (!personal || (page.access?.identityVerified && page.access?.profilePublic));
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState("");
  const active = useRef(null);
  const publishKey = useRef(null);

  const run = useCallback(async (operation, receive, unavailable) => {
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
        if (failure.status === 404 && unavailable) unavailable();
        else if (failure.status === 401 || (!unavailable && [403, 404].includes(failure.status))) setPage(null);
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
    signal => organizationId ? api.list(organizationId, cursor, signal) : personal ? api.memberList(cursor, signal) : api.feed(view, cursor, signal),
    data => setPage(previous => {
      if (!cursor || !previous) return data;
      const items = new Map(previous.items.map(item => [cardKey(item), item]));
      for (const item of data.items) items.set(cardKey(item), item);
      return { ...data, items: [...items.values()] };
    }),
  ), [organizationId, personal, run, view]);

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
    if (!canPublish || !body.trim() || active.current) return;
    setNotice("");
    publishKey.current ??= crypto.randomUUID();
    const draft = { body, requestKey: publishKey.current };
    void run(signal => personal ? api.memberPublish(draft, signal) : api.publish(organizationId, draft, signal), ({ post }) => {
      setPage(previous => ({ ...previous, items: [post, ...previous.items.filter(item => item.id !== post.id)] }));
      publishKey.current = null;
      setBody("");
      setNotice("Post published.");
    });
  }

  function updateFeedPost(post, operation, transform) {
    if (!page || disabled || active.current) return;
    const key = postKey(post);
    const remove = items => items.filter(item => postKey(item) !== key);
    void run(
      signal => operation(postSource(post), signal),
      data => setPage(previous => ({ ...previous, items: transform(previous.items, key, data) })),
      () => setPage(previous => ({ ...previous, items: remove(previous.items) })),
    );
  }

  function like(post) {
    updateFeedPost(post, (source, signal) => api.setLike(source, post.id, !post.reaction.liked, signal),
      (items, key, { reaction }) => items.map(item => postKey(item) === key ? { ...item, reaction } : item));
  }

  function save(post) {
    updateFeedPost(post, (source, signal) => api.setSaved(source, post.id, !post.saved, signal),
      (items, key, { saved }) => view === "saved" && !saved
        ? items.filter(item => postKey(item) !== key)
        : items.map(item => postKey(item) === key ? { ...item, saved } : item));
  }

  function repost(post) {
    updateFeedPost(post, (source, signal) => api.setReposted(source, post.id, !post.reposted, signal),
      (items, key, { reposted, repost: attribution }) => {
        const updated = items
          .filter(item => reposted || postKey(item) !== key || !item.repost?.mine)
          .map(item => postKey(item) === key ? { ...item, reposted } : item);
        if (view === "for-you" && attribution && !updated.some(item => item.repost?.id === attribution.id)) {
          updated.unshift({ ...post, reposted: true, repost: attribution });
        }
        return updated;
      });
  }

  function withdraw(id) {
    if (!page || disabled || active.current) return;
    setNotice("");
    void run(signal => personal ? api.memberWithdraw(id, signal) : api.withdraw(organizationId, id, signal), () => {
      setPage(previous => ({ ...previous, items: previous.items.filter(item => item.id !== id) }));
      setNotice("Post withdrawn.");
    });
  }

  return (
    <section className="bw-post-panel" aria-label={organization ? "Organization posts" : personal ? "Your posts" : "Explore posts"}>
      {personal && page && !canPublish && (
        <div className="bw-post-empty">
          {!page.access?.identityVerified && <p><Link to="/manual-identity">Verify your identity</Link> to publish personal posts.</p>}
          {!page.access?.profilePublic && <p><Link to="/profile">Publish your public profile</Link> so readers can see who shared the post.</p>}
        </div>
      )}
      {editable && (!personal || canPublish) && (
        <form className="bw-post-card bw-post-form" onSubmit={publish}>
          <h2>{personal ? "Write a post" : "Posts"}</h2>
          {organization && <p>Publish as <strong>{organization.name}</strong>.</p>}
          <label htmlFor="post-body">{personal ? "Share a learning or career update" : "Write an organization post"}</label>
          <textarea id="post-body" rows={5} maxLength={2000} value={body} disabled={pending || disabled}
            onChange={event => { publishKey.current = null; setBody(event.target.value); }} />
          <div className="bw-post-actions">
            <button type="submit" className="bw-post-primary" disabled={!canPublish || !body.trim() || pending}>Publish post</button>
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
          personal ? "You have no published posts yet." :
            view === "saved" ? "Save a post to find it here later." :
              view === "following" ? "Posts from people and organizations you follow will appear here." : "Posts from verified people and organizations will appear here."}</p>
      )}
      {page?.items.map(post => <PostCard key={cardKey(post)} post={post} editable={editable} busy={pending || disabled} onWithdraw={withdraw} onLike={like} onSave={save} onRepost={repost} />)}
      {page?.nextCursor && <button type="button" disabled={pending || disabled} onClick={() => void load(page.nextCursor)}>Load older posts</button>}
    </section>
  );
}
