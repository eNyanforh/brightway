import { useState } from "react";
import { Link } from "react-router-dom";
import { organizationPostsApi as api } from "../../api/organization-posts";

export default function EventRequestReview({ eventId, onReviewed }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [count, setCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  async function load() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = await api.eventRequests(eventId);
      setItems(result.items);
      setCount(result.pendingCount);
      setHasMore(result.hasMore);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  function toggle() {
    setOpen(current => !current);
    if (!open) void load();
  }

  async function decide(request, approved) {
    if (busy) return;
    setBusy(true); setBusyId(request.id); setError("");
    try {
      const result = await api.decideEventRequest(eventId, request.id, approved);
      onReviewed(result);
      // Re-read after mutation, including requests beyond the first page.
      const next = await api.eventRequests(eventId);
      setItems(next.items);
      setCount(next.pendingCount);
      setHasMore(next.hasMore);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); setBusyId(null); }
  }

  return (
    <div className="bw-event-review">
      <button type="button" className="bw-event-review-trigger" aria-expanded={open}
        onClick={toggle}>Manage attendance requests</button>
      {open && (
        <section className="bw-event-review-panel" aria-label="Attendance requests" aria-busy={busy}>
          <header>
            <strong>Pending approval {items && <span>({count})</span>}</strong>
            <button type="button" onClick={() => void load()} disabled={busy}>Refresh</button>
          </header>
          {error && <p className="bw-post-error" role="alert">{error}</p>}
          {!items && busy && <p role="status">Loading attendance requests…</p>}
          {!items && !busy && <button type="button" onClick={() => void load()}>Try again</button>}
          {items?.length === 0 && <p>No requests awaiting review.</p>}
          {items?.length > 0 && (
            <ul className="bw-event-request-list">
              {items.map(request => (
                <li className="bw-event-request" key={request.id}>
                  <div className="bw-event-request-person">
                    <strong>{request.name && request.verified
                      ? <Link to={"/people/" + encodeURIComponent(request.username)}>{request.name}</Link>
                      : "@" + request.username}</strong>
                    <small>Requested {new Date(request.createdAt).toLocaleDateString()}</small>
                  </div>
                  <div className="bw-event-request-controls">
                    <button type="button" className="bw-event-approve" disabled={busy}
                      onClick={() => void decide(request, true)}>
                      {busyId === request.id ? "Updating…" : "Approve"}
                    </button>
                    <button type="button" className="bw-event-reject" disabled={busy}
                      onClick={() => void decide(request, false)}>Decline</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {hasMore && <p>Showing 50 requests. Review some, then refresh to see more.</p>}
          <p>Approved attendees count toward capacity. No payments are collected through BrightWay.</p>
        </section>
      )}
    </div>
  );
}
