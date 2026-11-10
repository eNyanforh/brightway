import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { organizationPostsApi as api, memberPhotoUrl } from "../../api/organization-posts";
import PostTimestamp from "../posts/PostTimestamp";

const titles = {
  comments: { title: "Comments", empty: "No comments yet", action: "Commented on a post" },
  answers: { title: "Answers", empty: "No answers yet", action: "Answered a question" },
};

const postLink = post => "/explore?" + new URLSearchParams({
  source: post.source, post: post.id,
});

function MemberAvatar({ member }) {
  const [failed, setFailed] = useState(false);
  const url = member?.photoId && member?.username
    ? memberPhotoUrl(member.username, member.photoId) : null;
  const initial = (member?.name || member?.username || "M").charAt(0).toUpperCase();
  return <span className="bw-profile-contribution-avatar">
    {url && !failed ? <img src={url} alt="" loading="lazy"
      onError={() => setFailed(true)} /> : initial}
  </span>;
}

function ContributionCard({ item, member, kind }) {
  const label = kind === "answers" ? titles.answers.action
    : item.kind === "reply" ? "Replied to an answer" : titles.comments.action;
  return <article className="bw-profile-contribution-card" data-activity-kind={item.kind}>
    <div className="bw-profile-contribution-author">
      <Link to={"/" + encodeURIComponent(member.username)} className="bw-profile-contribution-portrait"
        aria-label={member.name + " profile"}>
        <MemberAvatar member={member} />
      </Link>
      <div className="bw-profile-contribution-byline">
        <Link to={"/" + encodeURIComponent(member.username)}>{member.name}</Link>
        <span className="bw-profile-contribution-handle">@{member.username}</span>
        <span aria-hidden="true">·</span>
        <PostTimestamp createdAt={item.createdAt} />
        <span className="bw-profile-contribution-action">{label}</span>
      </div>
    </div>
    <p className="bw-profile-contribution-body">{item.body}</p>
    {item.kind === "answer" && Number.isInteger(item.upvoteCount) && Number.isInteger(item.downvoteCount) && (
      <p className="bw-profile-contribution-score">
        <span>{item.upvoteCount} {item.upvoteCount === 1 ? "upvote" : "upvotes"}</span><span aria-hidden="true"> · </span>
        <span>{item.downvoteCount} {item.downvoteCount === 1 ? "downvote" : "downvotes"}</span>
      </p>
    )}
    <div className="bw-profile-contribution-context">
      <span className="bw-profile-contribution-context-kind">
        {item.kind === "answer" ? "Question" : item.kind === "reply" ? "Answer discussion" : "Original post"}
      </span>
      <Link to={postLink(item.post)}>{item.post.label}</Link>
      {item.context && <p>{item.context}</p>}
    </div>
    <Link className="bw-profile-contribution-discussion" to={postLink(item.post)}>
      View discussion <span aria-hidden="true">↗</span>
    </Link>
  </article>;
}

export default function ProfileActivityContributions({ kind, username }) {
  const [page, setPage] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const pending = useRef(null);
  const category = titles[kind];

  const load = useCallback(async (cursor = null) => {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError("");
    try {
      const result = await api.memberActivity(kind, cursor, username, controller.signal);
      if (controller.signal.aborted) return;
      setPage(previous => {
        if (!cursor || !previous) return result;
        const seen = new Map(previous.items.map(item => [item.id, item]));
        for (const item of result.items) seen.set(item.id, item);
        return { ...result, items: [...seen.values()] };
      });
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure.message || "Unable to load activity.");
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
  }, [kind, username]);

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => { if (mounted) void load(); });
    return () => {
      mounted = false;
      pending.current?.abort();
      pending.current = null;
    };
  }, [load]);

  const member = page?.member || { username: username || "", name: "Member", photoId: null };
  return <section className="bw-profile-contributions"
    role="region" aria-label={username ? "Member " + kind : "Your " + kind}>
    {!page && loading && <p role="status" className="bw-profile-muted">Loading {kind}…</p>}
    {error && <div className="bw-profile-activity-error" role="alert">
      <span>{error}</span>
      <button type="button" disabled={loading} onClick={() => void load()}>Try again</button>
    </div>}
    {page?.items.length === 0 && <div className="bw-profile-activity-empty">
      <strong>{category.empty}</strong>
      <p>{username ? "This member has not shared any visible " + kind + "." :
        "Your " + kind + " will appear here when you contribute to discussions."}</p>
    </div>}
    {page?.items.length > 0 && <div className="bw-profile-contribution-list">
      {page.items.map(item => <ContributionCard key={item.id + ":" + item.kind}
        item={item} member={member} kind={kind} />)}
    </div>}
    {page && <div className="bw-profile-activity-footer">
      {page.nextCursor && <button type="button" disabled={loading}
        onClick={() => void load(page.nextCursor)}>
        {loading ? "Loading…" : "Load older " + kind}
      </button>}
      <button type="button" disabled={loading} onClick={() => void load()}>
        Refresh {kind}
      </button>
    </div>}
  </section>;
}
