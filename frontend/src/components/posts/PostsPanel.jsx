import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { organizationPostsApi as api, memberPhotoUrl } from "../../api/organization-posts";
import { organizationPictureUrl } from "../../api/organization-profile";
import NavigationIcon from "../layout/NavigationIcon";
import PersonalPostComposer, { PersonalPostTypeLabel, PostTopicTags } from "./PersonalPostComposer";
import PostComments from "./PostComments";
import QuestionAnswers from "./QuestionAnswers";
import AvatarGroup from "./AvatarGroup";
import VerificationBadge from "../VerificationBadge";
import PostTimestamp from "./PostTimestamp";
import "./posts.css";

const postSource = post => post.organization ? "organization" : "member";
const postKey = post => postSource(post) + ":" + post.id;
const cardKey = post => post.repost ? "repost:" + post.repost.id : postKey(post);

const storyFormats = {
  ACHIEVEMENT: { icon: "awards", heading: "A milestone worth celebrating", note: "Progress shared with the community" },
  EVENT: { icon: "calendar", heading: "What's happening", note: "Community event" },
  QUESTION: { icon: "question", heading: "Let's learn together", note: "Answers help the community learn" },
};

function EventInfoCard({ details }) {
  if (!details?.title) return null;
  const date = value => {
    try { return new Intl.DateTimeFormat("en", {
      timeZone: details.timezone || "UTC", dateStyle: "medium", timeStyle: "short",
    }).format(new Date(value)); } catch { return ""; }
  };
  const showVenue = details.format !== "ONLINE" && Boolean(details.venue);
  const showLink = details.format !== "IN_PERSON" && /^https?:\/\//i.test(details.meetingUrl || "");
  return (
    <div className="bw-event-feed-card" data-theme={details.coverTheme || "NAVY"} aria-label="Event details">
      <div className="bw-event-feed-cover"><span>BRIGHTWAY EVENT</span><NavigationIcon name="calendar" size={30} /></div>
      <div className="bw-event-feed-content">
        <h3>{details.title}</h3>
        <p><NavigationIcon name="calendar" size={16} /> {date(details.startAt)} – {date(details.endAt)}</p>
        <p><NavigationIcon name="pin" size={16} /> {details.format === "ONLINE" ? "Online" : details.format === "HYBRID" ? "Hybrid" : "In person"}{showVenue ? " · " + details.venue : ""}</p>
        {showLink && <a href={details.meetingUrl} target="_blank" rel="noopener noreferrer">Join online <span aria-hidden="true">↗</span></a>}
      </div>
    </div>
  );
}

function QuestionAnswerSummary({ count, participants }) {
  return (
    <div className="bw-question-answer-summary" aria-label="Question answers">
      {participants.length > 0 && (
        <AvatarGroup max={3} className="bw-question-answer-facepile" label="Members who answered">
          {participants.map(person => {
            const initials = (person.name || person.username).trim().split(/\s+/).slice(0, 2)
              .map(part => part[0]).join("").toUpperCase();
            return (
              <Link key={person.username} className="bw-question-answer-avatar"
                to={"/people/" + encodeURIComponent(person.username)}
                title={person.name} aria-label={person.name + " answered"}>
                {person.photoId ? <img src={memberPhotoUrl(person.username, person.photoId)} alt="" loading="lazy" /> : initials}
              </Link>
            );
          })}
        </AvatarGroup>
      )}
      <span className="bw-question-answer-count" aria-live="polite">
        <strong>{count.toLocaleString()}</strong> {count === 1 ? "answer" : "answers"}
      </span>
    </div>
  );
}

function PostStory({ post, topicTags, timeline = false, answerCount = 0, answerParticipants = [] }) {
  const format = post.member && storyFormats[post.type];
  if (!format) return (
    <>
      {post.member && <PersonalPostTypeLabel type={post.type} />}
      <p className="bw-post-text">{post.body}</p>
      {topicTags}
    </>
  );
  return (
    <div className={timeline ? "bw-post-story bw-post-story--compact" : "bw-post-story"} data-post-type={post.type}>
      {timeline ? <PersonalPostTypeLabel type={post.type} /> : (
        <div className="bw-post-story-heading">
          <span className="bw-post-story-icon"><NavigationIcon name={format.icon} size={23} /></span>
          <div className="bw-post-story-heading-copy">
            <PersonalPostTypeLabel type={post.type} />
            <strong>{format.heading}</strong>
          </div>
        </div>
      )}
      {post.type === "EVENT" && <EventInfoCard details={post.eventDetails} />}
      {post.type === "QUESTION" && post.questionDetails?.title && (
        <div className="bw-question-feed-content">
          <span className="bw-question-feed-intent">{({
            EXPLANATION: "Concept explanation", FEEDBACK: "Feedback requested",
            GUIDANCE: "Looking for guidance", DISCUSSION: "Open discussion",
          })[post.questionDetails.intent] || "Community question"}</span>
          <h3>{post.questionDetails.title}</h3>
        </div>
      )}
      {!(post.type === "QUESTION" && post.questionDetails?.title?.trim() === post.body?.trim()) && (
        <p className="bw-post-text bw-post-story-body">{post.body}</p>
      )}
      {topicTags}
      {timeline && post.type === "QUESTION" && (
        <QuestionAnswerSummary count={answerCount} participants={answerParticipants} />
      )}
      {!timeline && <p className="bw-post-story-note">{format.note}</p>}
    </div>
  );
}

function PostCard({ post, timeline, busy, onWithdraw, onLike, onSave, onRepost, onRegister }) {
  const [confirming, setConfirming] = useState(false);
  const [answersOpen, setAnswersOpen] = useState(false);
  const [answerCount, setAnswerCount] = useState(post.answerCount ?? 0);
  const [answerParticipants, setAnswerParticipants] = useState(post.answerParticipants ?? []);
  const [reportOpen, setReportOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const [reason, setReason] = useState("SPAM");
  const [details, setDetails] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [cardError, setCardError] = useState("");
  const [shareNotice, setShareNotice] = useState("");
  const [failedAvatarUrl, setFailedAvatarUrl] = useState(null);
  const [viewCount, setViewCount] = useState(post.views);
  const cardRef = useRef(null);
  const viewed = useRef(null);
  const publisher = post.organization || post.member;
  const source = postSource(post);
  const type = post.member ? post.type ?? "POST" : "ORGANIZATION";
  const profileUrl = post.organization ? "/organizations/" + post.organization.id : "/people/" + encodeURIComponent(post.member.username);
  const topicTags = post.member && <PostTopicTags tags={post.tags} />;
  const imageUrl = post.member?.photoId
    ? memberPhotoUrl(post.member.username, post.member.photoId)
    : post.organization?.profilePhotoId
      ? organizationPictureUrl(post.organization.id, post.organization.profilePhotoId)
      : null;
  const publisherAvatar = imageUrl && failedAvatarUrl !== imageUrl
    ? <img src={imageUrl} alt="" loading="lazy" onError={() => setFailedAvatarUrl(imageUrl)} />
    : publisher.name.slice(0, 1).toUpperCase();
  const answerCountChanged = useCallback(delta => {
    setAnswerCount(current => Math.max(0, current + delta));
    // Refresh the server-authoritative preview only when an answer changes.
    void api.readPost("member", post.id).then(({ post: updated }) => {
      if (updated?.type !== "QUESTION") return;
      setAnswerCount(updated.answerCount ?? 0);
      setAnswerParticipants(updated.answerParticipants ?? []);
    }).catch(() => {
      // An optimistic count remains visible if the read fails; never fabricate a respondent.
    });
  }, [post.id]);

  useEffect(() => {
    if (!timeline || typeof post.views !== "number" || !cardRef.current ||
      typeof IntersectionObserver === "undefined") return undefined;
    const target = cardRef.current;
    const controller = new AbortController();
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting) || viewed.current === postKey(post)) return;
      viewed.current = postKey(post);
      observer.disconnect();
      void api.recordView(source, post.id, controller.signal)
        .then(data => { if (!controller.signal.aborted) setViewCount(data.views); })
        .catch(() => {});
    }, { threshold: 0.55 });
    observer.observe(target);
    return () => { observer.disconnect(); controller.abort(); };
  }, [timeline, post.id, post.views, source]);

  async function sharePost() {
    setShareNotice("");
    const url = new URL("/explore", window.location.origin);
    url.searchParams.set("post", post.id);
    url.searchParams.set("source", source);
    try {
      if (navigator.share) await navigator.share({ title: "BrightWay " + type.toLowerCase(), url: url.toString() });
      else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url.toString());
        setShareNotice("Post link copied.");
      } else setShareNotice("Share this link: " + url.toString());
    } catch (error) {
      if (error.name !== "AbortError") setShareNotice("Could not share this post.");
    }
  }

  async function reportQuestion(event) {
    event.preventDefault();
    if (reportBusy) return;
    setReportBusy(true); setCardError("");
    try {
      await api.reportQuestion(post.id, { reason, ...(details.trim() ? { details: details.trim() } : {}) });
      setReported(true); setReportOpen(false);
    } catch (error) { setCardError(error.message); }
    finally { setReportBusy(false); }
  }

  const primaryAction = type === "QUESTION" ? (
    <button type="button" className="bw-timeline-action bw-answer-primary-action"
      aria-label="Answer" title="Answer" aria-expanded={answersOpen}
      onClick={() => setAnswersOpen(open => !open)}>
      <NavigationIcon name="answer" size={19} />
      <span>Answer</span>
    </button>
  ) : type === "EVENT" ? (
    <button type="button" className="bw-timeline-action bw-signup-action" disabled={busy}
      aria-label={post.registration?.registered ? "Registered" : "Sign Up"}
      aria-pressed={Boolean(post.registration?.registered)}
      title={post.registration?.registered ? "Cancel registration" : "Sign Up"}
      onClick={() => onRegister(post)}>
      <NavigationIcon name="ticket" size={19} />
      <span>{post.registration?.registered ? "Registered" : "Sign Up"}</span>
      {post.registration?.count > 0 && <span className="bw-action-count">{post.registration.count}</span>}
    </button>
  ) : null;

  const controls = (
    <>
      {post.reaction && ["ACHIEVEMENT", "POST", "ORGANIZATION"].includes(type) && (
        <button type="button" className="bw-timeline-action bw-timeline-like-action" disabled={busy}
          aria-label={type === "ACHIEVEMENT" ? "Celebrate" : "Like"}
          title={type === "ACHIEVEMENT" ? "Celebrate" : "Like"}
          aria-pressed={post.reaction.liked} onClick={() => onLike(post)}>
          <NavigationIcon name={type === "ACHIEVEMENT" ? "celebrate" : "like"} size={19} active={post.reaction.liked} />
          <span aria-live="polite" className="bw-action-count">
            <span className="bw-timeline-sr">{post.reaction.count} {type === "ACHIEVEMENT" ? (post.reaction.count === 1 ? "celebration" : "celebrations") : (post.reaction.count === 1 ? "like" : "likes")}</span>
            {post.reaction.count > 0 && <span aria-hidden="true">{post.reaction.count}</span>}
          </span>
        </button>
      )}
      {typeof post.reposted === "boolean" && type !== "QUESTION" && (
        <button type="button" className="bw-timeline-action bw-timeline-repost-action" disabled={busy}
          aria-label={post.reposted ? "Undo repost" : "Repost"}
          title={post.reposted ? "Undo repost" : "Repost"}
          data-active={post.reposted} onClick={() => onRepost(post)}>
          <NavigationIcon name="repost" size={19} />
        </button>
      )}
      <button type="button" className="bw-timeline-action" aria-label="Share" title="Share"
        onClick={() => void sharePost()}><NavigationIcon name="share" size={19} /></button>
      {type === "QUESTION" && (
        <button type="button" className="bw-timeline-action" aria-label="Report question" title="Report"
          aria-expanded={reportOpen} disabled={reported} onClick={() => setReportOpen(open => !open)}>
          <NavigationIcon name="flag" size={19} />
        </button>
      )}
      {typeof viewCount === "number" && (
        <span className="bw-post-view-metric" aria-label={viewCount + " views"} title={viewCount + " views"}>
          <NavigationIcon name="analytics" size={19} /> <span>{viewCount.toLocaleString()}</span>
        </span>
      )}
      {typeof post.saved === "boolean" && ["POST", "ORGANIZATION"].includes(type) && (
        <button type="button" className="bw-timeline-action bw-timeline-save-action" disabled={busy}
          aria-label="Save post" title={post.saved ? "Remove bookmark" : "Bookmark"}
          aria-pressed={post.saved} onClick={() => onSave(post)}>
          <NavigationIcon name="bookmark" size={19} active={post.saved} />
        </button>
      )}
    </>
  );

  const extras = (
    <>
      {shareNotice && <p className="bw-post-action-notice" role="status">{shareNotice}</p>}
      {cardError && <p className="bw-post-error" role="alert">{cardError}</p>}
      {reported && <p className="bw-post-action-notice" role="status">Report submitted for moderation.</p>}
      {reportOpen && !reported && (
        <form className="bw-question-report" aria-label="Report question" onSubmit={event => void reportQuestion(event)}>
          <label>Reason
            <select value={reason} onChange={e => setReason(e.target.value)} disabled={reportBusy}>
              <option value="SPAM">Spam</option>
              <option value="HARASSMENT">Harassment</option>
              <option value="MISINFORMATION">Misinformation</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label>Additional details (optional)
            <textarea rows={2} maxLength={500} value={details} disabled={reportBusy}
              onChange={e => setDetails(e.target.value)} />
          </label>
          <div className="bw-post-actions">
            <button type="submit" disabled={reportBusy}>Submit report</button>
            <button type="button" disabled={reportBusy} onClick={() => setReportOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
      {answersOpen && type === "QUESTION" && (
        <QuestionAnswers questionId={post.id} onClose={() => setAnswersOpen(false)} onCountChange={answerCountChanged} />
      )}
    </>
  );

  if (timeline) {
    return (
      <article className="bw-timeline-post" data-post-type={type} ref={cardRef} id={"post-" + source + "-" + post.id}>
        {post.repost && (
          <p className="bw-timeline-repost">
            <NavigationIcon name="repost" size={15} />
            <Link to={post.repost.mine ? "/profile" : "/people/" + encodeURIComponent(post.repost.member.username)}>
              {post.repost.mine ? "You" : post.repost.member.name}
            </Link>
            {post.repost.member.verified === true && <VerificationBadge />}
            <span>reposted</span>
          </p>
        )}
        <Link className="bw-timeline-avatar" to={profileUrl} aria-hidden="true" tabIndex={-1}>
          {publisherAvatar}
        </Link>
        <div className="bw-timeline-post-main">
          <header className="bw-timeline-byline">
            <span className="bw-post-publisher-name">
              <Link to={profileUrl}>{publisher.name}</Link>
              {post.member?.verified === true && <VerificationBadge />}
              {post.organization && <VerificationBadge kind="organization" />}
            </span>
            {publisher.username && <span>@{publisher.username}</span>}
            <span aria-hidden="true">·</span>
            <PostTimestamp createdAt={post.createdAt} />
          </header>
          <PostStory post={post} topicTags={topicTags} timeline
            answerCount={answerCount} answerParticipants={answerParticipants} />
          <PostComments postId={post.id} source={source}
            showComment={type !== "QUESTION"} primaryAction={primaryAction}>
            {controls}
          </PostComments>
          {extras}
        </div>
      </article>
    );
  }
  return (
    <article className="bw-post-card" data-post-type={type}>
      <header>
        <span className="bw-post-badge" aria-hidden="true">{publisherAvatar}</span>
        <div>
          <span className="bw-post-publisher-name">
            <Link to={profileUrl}>{publisher.name}</Link>
            {post.member?.verified === true && <VerificationBadge />}
            {post.organization && <VerificationBadge kind="organization" />}
          </span>
          <p><PostTimestamp createdAt={post.createdAt} /></p>
        </div>
      </header>
      <PostStory post={post} topicTags={topicTags} />
      {confirming ? <div className="bw-post-actions">
        <span>Withdraw this post from Explore?</span>
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
  const [type, setType] = useState("ACHIEVEMENT");
  const [composerOpen, setComposerOpen] = useState(false);
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
    async signal => {
      const data = await (organizationId ? api.list(organizationId, cursor, signal)
        : personal ? api.memberList(cursor, signal) : api.feed(view, cursor, signal));
      if (timeline && !cursor && !organizationId && !personal) {
        const params = new URLSearchParams(window.location.search);
        const source = params.get("source");
        const id = params.get("post");
        if (["member", "organization"].includes(source) &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || "")) {
          try {
            const { post } = await api.readPost(source, id, signal);
            if (!data.items.some(item => postKey(item) === postKey(post))) data.items.unshift(post);
          } catch (error) {
            // A deleted or inaccessible shared post must not hide the rest of Explore.
            if (error.status !== 403 && error.status !== 404) throw error;
          }
        }
      }
      return data;
    },
    data => setPage(previous => {
      if (!cursor || !previous) return data;
      const items = new Map(previous.items.map(item => [cardKey(item), item]));
      for (const item of data.items) items.set(cardKey(item), item);
      return { ...data, items: [...items.values()] };
    }),
  ), [organizationId, personal, run, view, timeline]);

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

  function selectComposer(value) {
    publishKey.current = null;
    setType(value);
    setBody("");
    setTags([]);
    setError(null);
    setComposerOpen(true);
  }

  function cancelComposer() {
    if (pending) return;
    publishKey.current = null;
    setBody("");
    setTags([]);
    setType("ACHIEVEMENT");
    setComposerOpen(false);
    setError(null);
  }

  function changeTags(value) {
    publishKey.current = null;
    setTags(value);
  }

  function publish(event, eventDetails, questionDetails) {
    event.preventDefault();
    if (!canPublish || !body.trim() || (memberComposer && (!composerOpen || !tags.length)) || active.current) return;
    setNotice("");
    publishKey.current ??= crypto.randomUUID();
    const draft = { body, requestKey: publishKey.current };
    void run(signal => memberComposer ? api.memberPublish({ ...draft, type, tags, ...(type === "EVENT" && eventDetails ? { eventDetails } : {}), ...(type === "QUESTION" && questionDetails ? { questionDetails } : {}) }, signal) : api.publish(organizationId, draft, signal), ({ post }) => {
      const published = timeline ? { ...post, reaction: { liked: false, count: 0 }, saved: false, reposted: false, views: 0, ...(type === "EVENT" ? { registration: { registered: false, count: 0 } } : {}), ...(type === "QUESTION" ? { answerCount: 0 } : {}) } : post;
      setPage(previous => ({
        ...previous,
        items: [published, ...(previous?.items || []).filter(item => cardKey(item) !== cardKey(published))],
      }));
      publishKey.current = null;
      setBody("");
      setType("ACHIEVEMENT");
      setTags([]);
      setComposerOpen(false);
      setNotice(memberComposer ? (type === "QUESTION" ? "Question published." : type === "EVENT" ? "Event published." : "Achievement published.") : "Post published.");
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

  function register(post) {
    updateFeedPost(post, (_source, signal) => api.registerEvent(post.id, !post.registration?.registered, signal),
      (items, key, { registration }) => items.map(item => postKey(item) === key ? { ...item, registration } : item));
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
          open={composerOpen} disabled={!canPublish || pending}
          onSelect={selectComposer} onCancel={cancelComposer} onBodyChange={changeBody}
          onTagsChange={changeTags} onSubmit={publish} />
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
      {notice && <p role="status">{notice}</p>}
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
      {page?.items.map(post => <PostCard key={cardKey(post)} post={post} timeline={timeline} busy={pending || disabled} onWithdraw={withdraw} onLike={like} onSave={save} onRepost={repost} onRegister={register} />)}
      {page?.nextCursor && <button type="button" disabled={pending || disabled} onClick={() => void load(page.nextCursor)}>Load older posts</button>}
    </section>
  );
}
