import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { profileApi } from "../../api/profile";
import "./profile-dashboard.css";

const metrics = [
  {
    key: "profileViews",
    label: "Profile views",
    description: "See how often members viewed your public profile.",
    detail: "Counted once per viewer per UTC day. Viewer names are never revealed by this dashboard; identity-sharing controls only apply to notifications.",
    route: "/notifications",
    routeLabel: "View shared profile notifications",
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
    detail: "Counts an eligible result once per searching member per UTC day. Only visible, unblocked directory results are counted; search terms and identities are not displayed.",
  },
];

function Metric({ metric, value, selected, onSelect }) {
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
