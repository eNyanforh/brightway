import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { organizationPostsApi } from "../../api/organization-posts";
import PostTimestamp from "../posts/PostTimestamp";
import "./profile-activities.css";

const activityTypes = {
  ACHIEVEMENT: "Achievement",
  EVENT: "Event",
  QUESTION: "Question",
  POST: "Post",
};

function ActivityItem({ item }) {
  const category = activityTypes[item.type] || "Post";
  const title = item.type === "EVENT" ? item.eventDetails?.title
    : item.type === "QUESTION" ? item.questionDetails?.title : null;
  const params = new URLSearchParams({ source: "member", post: item.id });
  return (
    <article className="bw-profile-activity-item" data-activity-type={item.type}>
      <div className="bw-profile-activity-top">
        <span className="bw-profile-activity-type">{category}</span>
        <PostTimestamp createdAt={item.createdAt} />
      </div>
      {title && <h3>{title}</h3>}
      <p className="bw-profile-activity-body">{item.body}</p>
      {Array.isArray(item.tags) && item.tags.length > 0 && (
        <ul className="bw-profile-activity-topics" aria-label="Activity topics">
          {item.tags.map(tag => <li key={tag}>{tag}</li>)}
        </ul>
      )}
      <Link className="bw-profile-activity-link" to={"/explore?" + params.toString()}>
        View post <span aria-hidden="true">↗</span>
      </Link>
    </article>
  );
}

/** Uses the existing authenticated member post history, not inferred activity metrics. */
export default function ProfileActivities({ accountId }) {
  const [page, setPage] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const controllerRef = useRef(null);

  const load = useCallback(async (cursor = null) => {
    if (controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError("");
    try {
      const result = await organizationPostsApi.memberList(cursor, controller.signal);
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
  }, []);

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => { if (mounted) void load(); });
    return () => {
      mounted = false;
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, [accountId, load]);

  return (
    <section id="profile-activity" className="bw-profile-card bw-profile-section bw-profile-activities"
      aria-labelledby="profile-activities-title">
      <div className="bw-profile-section-head">
        <div>
          <h2 id="profile-activities-title">Activities</h2>
          <p className="bw-profile-activity-description">Your published achievements, events, and questions.</p>
        </div>
        <Link className="bw-profile-activity-all" to="/posts">All posts</Link>
      </div>

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
          <p>Your published achievements, events, and questions will appear here.</p>
          <Link to="/posts">Explore posting options</Link>
        </div>
      )}
      {page?.items.length > 0 && (
        <div className="bw-profile-activity-list">
          {page.items.map(item => <ActivityItem key={item.id} item={item} />)}
        </div>
      )}
      {(page?.nextCursor || (page && !loading)) && (
        <div className="bw-profile-activity-footer">
          {page?.nextCursor && <button type="button" disabled={loading}
            onClick={() => void load(page.nextCursor)}>{loading ? "Loading…" : "Load older activity"}</button>}
          <button type="button" disabled={loading} onClick={() => void load()}>
            Refresh activity
          </button>
        </div>
      )}
    </section>
  );
}
