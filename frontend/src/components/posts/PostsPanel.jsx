import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { organizationPostsApi as api } from "../../api/organization-posts";
import NavigationIcon from "../layout/NavigationIcon";
import PersonalPostComposer, { PersonalPostTypeLabel, PostTopicTags } from "./PersonalPostComposer";
import PostComments from "./PostComments";
import "./posts.css";

const time = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

const timelineDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

const reviewLabels = { PENDING: "Pending review", PUBLISHED: "Published", REJECTED: "Declined" };
const submissionNotices = {
  PENDING: "Post submitted for review.",
  PUBLISHED: "Post published.",
  REJECTED: "The review decision is available in My Posts.",
};

const postSource = post => post.organization ? "organization" : "member";
const postKey = post => postSource(post) + ":" + post.id;
const cardKey = post => post.repost ? "repost:" + post.repost.id : postKey(post);

function PostCard({ post, timeline, busy, onWithdraw, onLike, onSave, onRepost }) {
  const [confirming, setConfirming] = useState(false);
  const publisher = post.organization || post.member;
  const profileUrl = post.organization ? "/organizations/" + post.organization.id : "/people/" + encodeURIComponent(post.member.username);
  const typeLabel = post.member && <PersonalPostTypeLabel type={post.type} />;
  const topicTags = post.member && <PostTopicTags tags={post.tags} />;
  if (timeline) {
    return (
      <article className="bw-timeline-post">
        {post.repost && (
          <p className="bw-timeline-repost">
            <NavigationIcon name="repost" size={15} />
            <Link to={post.repost.mine ? "/profile" : "/people/" + encodeURIComponent(post.repost.member.username)}>{post.repost.mine ? "You" : post.repost.member.name}</Link>
            <span>reposted</span>
          </p>
        )}
        <Link className="bw-timeline-avatar" to={profileUrl} aria-hidden="true" tabIndex={-1}>{publisher.name.slice(0, 1).toUpperCase()}</Link>
        <div className="bw-timeline-post-main">
          <header className="bw-timeline-byline">
            <Link to={profileUrl}>{publisher.name}</Link>
            {publisher.username && <span>@{publisher.username}</span>}
            <span aria-hidden="true">·</span>
            <time dateTime={post.createdAt} title={time.format(new Date(post.createdAt))}>{timelineDate.format(new Date(post.createdAt))}</time>
          </header>
          {typeLabel}
          <p className="bw-post-text">{post.body}</p>
          {topicTags}
          <PostComments postId={post.id} source={postSource(post)}>
            {typeof post.reposted === "boolean" && (
              <button type="button" className="bw-timeline-action bw-timeline-repost-action" disabled={busy}
                aria-label={post.reposted ? "Undo repost" : "Repost"} title={post.reposted ? "Undo repost" : "Repost"}
                data-active={post.reposted} onClick={() => onRepost(post)}><NavigationIcon name="repost" size={19} /></button>
            )}
            {post.reaction && (
              <button type="button" className="bw-timeline-action bw-timeline-like-action" disabled={busy}
                aria-label="Like" title="Like" aria-pressed={post.reaction.liked} onClick={() => onLike(post)}>
                <NavigationIcon name="like" size={19} active={post.reaction.liked} />
                <span aria-live="polite">
                  <span className="bw-timeline-sr">{post.reaction.count} {post.reaction.count === 1 ? "like" : "likes"}</span>
                  {post.reaction.count > 0 && <span aria-hidden="true">{post.reaction.count}</span>}
                </span>
              </button>
            )}
            {typeof post.saved === "boolean" && (
              <button type="button" className="bw-timeline-action bw-timeline-save-action" disabled={busy}
                aria-label="Save post" title={post.saved ? "Remove bookmark" : "Bookmark"} aria-pressed={post.saved}
                onClick={() => onSave(post)}><NavigationIcon name="bookmark" size={19} active={post.saved} /></button>
            )}
          </PostComments>
        </div>
      </article>
    );
  }
  return (
    <article className="bw-post-card">
      <header>
        <span className="bw-post-badge" aria-hidden="true">{publisher.name.slice(0, 1).toUpperCase()}</span>
        <div>
          <Link to={profileUrl}>{publisher.name}</Link>
          <p><time dateTime={post.createdAt}>{time.format(new Date(post.createdAt))}</time></p>
        </div>
      </header>
      {typeLabel}
      {reviewLabels[post.moderationStatus] && <span className="bw-post-review-status" data-status={post.moderationStatus}>{reviewLabels[post.moderationStatus]}</span>}
      <p className="bw-post-text">{post.body}</p>
      {topicTags}
      {post.moderationFeedback && <div className="bw-post-review-feedback"><strong>Review feedback</strong><p>{post.moderationFeedback}</p></div>}
      {confirming ? <div className="bw-post-actions">
        <span>{post.member ? "Withdraw this post?" : "Withdraw this post from Explore?"}</span>
        <button type="button" disabled={busy} onClick={() => onWithdraw(post.id)}>Confirm withdrawal</button>
        <button type="button" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
      </div> : <button type="button" className="bw-post-quiet" disabled={busy} onClick={() => setConfirming(true)}>Withdraw post</button>}
    </article>
  );
}

export default function PostsPanel({ organization, personal = false, view = "for-you", disabled = false, timeline = false, composerAccount, composerPhotoId }) {
  const organizationId = organization?.id;
  const inlineComposer = timeline && Boolean(composerAccount);
  const memberComposer = personal || inlineComposer;
  const [page, setPage] = useState(null);
  const canPublish = !disabled && Boolean(personal ? page?.access?.identityVerified && page.access.profilePublic : inlineComposer || page);
  const [body, setBody] = useState("");
  const [type, setType] = useState("POST");
  const [tags, setTags] = useState([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState("");
  const active = useRef(null);
  const publishKey = useRef(null);

  const run = useCallback(async (operation, receive, { unavailable, preserveOnDenied = false } = {}) => {
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
        else if (failure.status === 401 || (!unavailable && !preserveOnDenied && [403, 404].includes(failure.status))) setPage(null);
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

  function changeBody(value) {
    publishKey.current = null;
    setBody(value);
  }

  function changeType(value) {
    publishKey.current = null;
    setType(value);
  }

  function changeTags(value) {
    publishKey.current = null;
    setTags(value);
  }

  function publish(event) {
    event.preventDefault();
    if (!canPublish || !body.trim() || (memberComposer && !tags.length) || active.current) return;
    setNotice("");
    publishKey.current ??= crypto.randomUUID();
    const draft = { body, requestKey: publishKey.current };
    void run(signal => memberComposer ? api.memberPublish({ ...draft, type, tags }, signal) : api.publish(organizationId, draft, signal), ({ post }) => {
      if (!timeline || post.moderationStatus === "PUBLISHED") {
        const item = timeline ? { ...post, reaction: { liked: false, count: 0 }, saved: false, reposted: false } : post;
        setPage(previous => ({
          ...previous,
          items: [item, ...(previous?.items || []).filter(previousItem => cardKey(previousItem) !== cardKey(item))],
        }));
      }
      publishKey.current = null;
      setBody("");
      setType("POST");
      setTags([]);
      setNotice(memberComposer ? submissionNotices[post.moderationStatus] ?? submissionNotices.PENDING : "Post published.");
    }, { preserveOnDenied: inlineComposer });
  }

  function updateFeedPost(post, operation, transform) {
    if (!page || disabled || active.current) return;
    const key = postKey(post);
    const remove = items => items.filter(item => postKey(item) !== key);
    void run(
      signal => operation(postSource(post), signal),
      data => setPage(previous => ({ ...previous, items: transform(previous.items, key, data) })),
      { unavailable: () => setPage(previous => ({ ...previous, items: remove(previous.items) })) },
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
    <section className={timeline ? "bw-post-panel bw-timeline-panel" : "bw-post-panel"} aria-label={organization ? "Organization posts" : personal ? "Your posts" : "Explore posts"}>
      {memberComposer && (!personal || canPublish) && (
        <PersonalPostComposer account={composerAccount} photoId={composerPhotoId} body={body} type={type} tags={tags}
          disabled={!canPublish || pending}
          onBodyChange={changeBody} onTypeChange={changeType} onTagsChange={changeTags} onSubmit={publish} />
      )}
      {personal && page && !canPublish && (
        <div className="bw-post-empty">
          {!page.access?.identityVerified && <p><Link to="/manual-identity">Verify your identity</Link> to publish personal posts.</p>}
          {!page.access?.profilePublic && <p><Link to="/profile">Publish your public profile</Link> so readers can see who shared the post.</p>}
        </div>
      )}
      {organization && (
        <form className="bw-post-card bw-post-form" onSubmit={publish}>
          <h2>Posts</h2>
          <p>Publish as <strong>{organization.name}</strong>.</p>
          <label htmlFor="post-body">Write an organization post</label>
          <textarea id="post-body" rows={5} maxLength={2000} value={body} disabled={pending || disabled}
            onChange={event => changeBody(event.target.value)} />
          <div className="bw-post-actions">
            <button type="submit" className="bw-post-primary" disabled={!canPublish || !body.trim() || pending}>Publish post</button>
            <span>{body.length} / 2,000</span>
          </div>
        </form>
      )}
      {notice && <p role="status">{notice}{inlineComposer && <> <Link to="/posts">Track your submissions</Link></>}</p>}
      {error && <p className="bw-post-error" role="alert">{error.message}{inlineComposer && error.status === 403 && <> <Link to="/profile">Open your profile</Link></>}</p>}
      {!page && !error && <p role="status">Loading posts…</p>}
      <div className={timeline ? "bw-timeline-refresh" : "bw-post-actions"}>
        <button type="button" disabled={pending || disabled} onClick={() => void load()}>{timeline ? "Refresh feed" : "Refresh posts"}</button>
      </div>
      {page?.items.length === 0 && (
        <p className="bw-post-empty">{organization ? "Your organization has no published posts yet." :
          personal ? "You have no published posts yet." :
            view === "saved" ? "Save a post to find it here later." :
              view === "following" ? "Posts from people and organizations you follow will appear here." : "Posts from verified people and organizations will appear here."}</p>
      )}
      {page?.items.map(post => <PostCard key={cardKey(post)} post={post} timeline={timeline} busy={pending || disabled} onWithdraw={withdraw} onLike={like} onSave={save} onRepost={repost} />)}
      {page?.nextCursor && <button type="button" disabled={pending || disabled} onClick={() => void load(page.nextCursor)}>Load older posts</button>}
    </section>
  );
}
