import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { organizationPostsApi as api } from "../../api/organization-posts";
import { PostCard } from "../posts/PostsPanel";
import "./profile-activities.css";

const postLink = id => "/explore?" + new URLSearchParams({ source: "member", post: id });

/** Complete owner post history in a vertical, single-column timeline.
 * Older posts append below existing posts, retaining all post interactions.
 */
export default function ProfileActivities({ accountId, username = null }) {
  const publicProfile = Boolean(username);
  const [page, setPage] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mutatingId, setMutatingId] = useState(null);
  const controllerRef = useRef(null);

  const load = useCallback(async (cursor = null) => {
    if (controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError("");
    try {
      const result = username
        ? await api.publicMemberList(username, cursor, controller.signal)
        : await api.memberList(cursor, controller.signal);
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
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
  }, [username]);

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => { if (mounted) {
      setPage(null);
      void load();
    } });
    return () => {
      mounted = false;
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, [accountId, load]);

  async function updatePost(post, operation, project) {
    if (mutatingId || loading) return;
    setMutatingId(post.id);
    setError("");
    try {
      const response = await operation();
      setPage(previous => previous && ({
        ...previous,
        items: previous.items.map(item => item.id === post.id ? project(item, response) : item),
      }));
    } catch (failure) {
      setError(failure.message || "Could not update this post.");
    } finally {
      setMutatingId(null);
    }
  }

  function like(post) {
    void updatePost(post,
      () => api.setLike("member", post.id, !post.reaction.liked),
      (item, data) => ({ ...item, reaction: data.reaction }));
  }
  function save(post) {
    void updatePost(post,
      () => api.setSaved("member", post.id, !post.saved),
      (item, data) => ({ ...item, saved: data.saved }));
  }
  function repost(post) {
    void updatePost(post,
      () => api.setReposted("member", post.id, !post.reposted),
      (item, data) => ({
        ...item, reposted: data.reposted,
        repostCount: Math.max(0, item.repostCount + (data.reposted ? 1 : -1)),
      }));
  }
  function register(post) {
    void updatePost(post,
      () => api.registerEvent(post.id,
        !(post.registration?.registered || post.registration?.status === "PENDING")),
      (item, data) => ({
        ...item, registration: data.registration,
        eventAttendees: data.eventAttendees ?? item.eventAttendees ?? [],
      }));
  }
  async function editPost(post, payload) {
    if (mutatingId || loading) throw new Error("Finish the current post action first.");
    setMutatingId(post.id);
    setError("");
    try {
      const { post: updated } = await api.memberEdit(post.id, payload);
      setPage(previous => previous && ({
        ...previous,
        items: previous.items.map(item => item.id === post.id ? { ...item, ...updated } : item),
      }));
    } catch (failure) {
      setError(failure.message || "Unable to edit this post.");
      throw failure;
    } finally {
      setMutatingId(null);
    }
  }
  async function withdraw(id) {
    if (mutatingId || loading) throw new Error("Finish the current post action first.");
    setMutatingId(id);
    setError("");
    try {
      await api.memberWithdraw(id);
      setPage(previous => previous && ({ ...previous, items: previous.items.filter(item => item.id !== id) }));
    } catch (failure) {
      setError(failure.message || "Unable to delete this post.");
      throw failure;
    } finally {
      setMutatingId(null);
    }
  }
  return (
    <section id={publicProfile ? "public-profile-activity" : "profile-activity"} className="bw-profile-activities"
      aria-label={publicProfile ? "Member activity" : "Your community posts"}>

      {!page && loading && <p role="status" className="bw-profile-muted">Loading activity…</p>}
      {error && (
        <div className="bw-profile-activity-error" role="alert">
          <span>{error}</span>
          <button type="button" disabled={loading} onClick={() => void load()}>Try again</button>
        </div>
      )}
      {page?.items.length === 0 && (
        <div className="bw-profile-activity-empty">
          <strong>No activity yet</strong>
          <p>{publicProfile ? "Published achievements, events and questions will appear here." : "Your published achievements, events, and questions will appear here."}</p>
          {!publicProfile && <Link to="/posts">Explore posting options</Link>}
        </div>
      )}
      {page?.items.length > 0 && (
        <div className="bw-profile-activity-list"
          role="region" aria-label={publicProfile ? "Member posts" : "Your posts"}>
            {page.items.map(post => (
              <div className="bw-profile-activity-item bw-post-panel bw-timeline-panel"
                data-activity-type={post.type} key={post.id}>
                <PostCard
                  post={post} timeline trackViews={false} busy={loading || Boolean(mutatingId)}
                  canManage={!publicProfile} canManageEvent={!publicProfile} onWithdraw={withdraw} onEdit={editPost} onLike={like}
                  onSave={save} onRepost={repost} onRegister={register}
                />
                <Link className="bw-profile-activity-link" to={postLink(post.id)}>
                  View full post <span aria-hidden="true">↗</span>
                </Link>
              </div>
            ))}
        </div>
      )}
      {(page?.nextCursor || (page && !loading)) && (
        <div className="bw-profile-activity-footer">
          {page?.nextCursor && <button type="button" disabled={loading}
            onClick={() => void load(page.nextCursor)}>{loading ? "Loading…" : "Load older activity"}</button>}
          <button type="button" disabled={loading} onClick={() => void load()}>
            Refresh activity
          </button>
          {!publicProfile && <Link className="bw-profile-activity-all" to="/posts">All posts</Link>}
        </div>
      )}
    </section>
  );
}
