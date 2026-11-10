import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { profileApi } from "../../api/profile";
import { memberPhotoUrl } from "../../api/organization-posts";
import AvatarGroup from "../posts/AvatarGroup";
import "./profile-dashboard.css";

const metrics = [
  {
    key: "profileViews",
    label: "Profile views",
    description: "See how often members viewed your profile.",
    detail: "Counted once per viewer per UTC day. Recent active, unblocked visitors appear below. Contact details are never shown.",
    route: "/notifications",
    routeLabel: "View profile notifications",
  },
  {
    key: "postImpressions",
    label: "Post impressions",
    description: "See engagement with your posts over the past 7 days.",
    detail: "BrightWay records unique member views per post, not every repeated screen impression. Withdrawn posts and your own views are excluded.",
    route: "/posts",
    routeLabel: "Manage your posts",
  },
  {
    key: "searchAppearances",
    label: "Search appearances",
    description: "See how often you appeared in member searches.",
    detail: "Counts an eligible result once per searching member per UTC day. Recent active, unblocked searchers are shown below; their search terms are not disclosed.",
  },
];

function AnonymousAvatar({ kind }) {
  return (
    <span className="bw-dashboard-avatar bw-dashboard-avatar-anonymous"
      role="img" aria-label={kind === "searchAppearances" ? "Additional search appearance" : "Additional profile view"}>
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
        strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5.3 20c.3-4 2.9-6.1 6.7-6.1s6.4 2.1 6.7 6.1" />
      </svg>
    </span>
  );
}

function MemberMetricAvatar({ viewer, metric }) {
  const [failed, setFailed] = useState(false);
  const photo = viewer.photoId && viewer.username
    ? memberPhotoUrl(viewer.username, viewer.photoId) : null;
  return (
    <Link className="bw-dashboard-avatar bw-dashboard-avatar-named"
      to={"/people/" + encodeURIComponent(viewer.username)}
      title={viewer.name} aria-label={viewer.name + (metric === "profileViews" ? " viewed your profile" : " found you in search")}>
      {photo && !failed ? <img src={photo} alt="" loading="lazy" onError={() => setFailed(true)} />
        : <span aria-hidden="true">{viewer.name?.trim().slice(0, 1).toUpperCase() || "?"}</span>}
    </Link>
  );
}

function MetricAvatars({ metric, count, viewers }) {
  if (!Number.isSafeInteger(count) || count <= 0
    || !["profileViews", "searchAppearances"].includes(metric)) return null;
  const shown = Math.min(count, 3);
  const named = Array.isArray(viewers)
    ? viewers.filter(person => person && typeof person.username === "string"
      && person.username && typeof person.name === "string" && person.name).slice(0, shown)
    : [];
  return (
    <div className="bw-dashboard-avatar-summary">
      <AvatarGroup className="bw-dashboard-avatar-group" max={3}
        label={metric === "profileViews" ? "Recent profile viewers" : "Recent searchers"}>
        {named.map(person => <MemberMetricAvatar key={person.username} viewer={person} metric={metric} />)}
        {Array.from({ length: shown - named.length }, (_, index) =>
          <AnonymousAvatar key={"private-" + index} kind={metric} />)}
      </AvatarGroup>
      <span className="bw-dashboard-avatar-note">
        {metric === "profileViews" ? "Recent profile visitors" : "Recent searchers"}
      </span>
    </div>
  );
}

function Metric({ metric, value, count, viewers, selected, onSelect }) {
  const expanded = selected === metric.key;
  return (
    <div className="bw-dashboard-metric">
      <button
        type="button"
        className="bw-dashboard-metric-trigger"
        aria-expanded={expanded}
        aria-controls={`dashboard-detail-${metric.key}`}
        onClick={() => onSelect(expanded ? null : metric.key)}
      >
        <strong className="bw-dashboard-count">{value}</strong>
        <span className="bw-dashboard-metric-label">{metric.label}</span>
        <span className="bw-dashboard-metric-description">{metric.description}</span>
      </button>
      <MetricAvatars metric={metric.key} count={count} viewers={viewers} />
      {expanded && (
        <div id={`dashboard-detail-${metric.key}`} className="bw-dashboard-metric-detail">
          <p>{metric.detail}</p>
          {metric.route && <Link to={metric.route}>{metric.routeLabel}</Link>}
        </div>
      )}
    </div>
  );
}

export default function ProfileDashboard({ accountId }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(async () => {
      if (controller.signal.aborted) return;
      setStats(null);
      setError("");
      try {
        const result = await profileApi.dashboard(controller.signal);
        if (!controller.signal.aborted) setStats(result);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure.message || "Unable to load your dashboard.");
      }
    });
    return () => controller.abort();
  }, [accountId, refresh]);

  return (
    <section id="profile-dashboard" className="bw-profile-card bw-profile-dashboard" aria-labelledby="profile-dashboard-heading">
      <div className="bw-dashboard-head">
        <div>
          <h2 id="profile-dashboard-heading">Dashboard</h2>
          <p className="bw-dashboard-private">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="5" y="10" width="14" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            Private to you
          </p>
        </div>
        <span className="bw-dashboard-period">Past 7 days</span>
      </div>

      {!stats && !error && <p className="bw-dashboard-loading" role="status">Loading your dashboard…</p>}
      {error && (
        <div className="bw-dashboard-error" role="status">
          <span>{error}</span>
          <button type="button" onClick={() => setRefresh(previous => previous + 1)}>Try again</button>
        </div>
      )}
      {stats && (
        <>
          <div className="bw-dashboard-metrics">
            {metrics.map(metric => (
              <Metric
                key={metric.key}
                metric={metric}
                value={Number.isSafeInteger(stats[metric.key]) && stats[metric.key] >= 0
                  ? stats[metric.key].toLocaleString() : "—"}
                count={stats[metric.key]}
                viewers={metric.key === "profileViews" ? stats.recentProfileViewers : stats.recentSearchers}
                selected={selected}
                onSelect={setSelected}
              />
            ))}
          </div>
          <p className="bw-dashboard-note">
            Counts reflect recorded BrightWay activity, starting when tracking was enabled.
            Select a metric to see how it is measured.
          </p>
        </>
      )}
    </section>
  );
}
