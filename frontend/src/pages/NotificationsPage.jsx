import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { APPLICATION_STATUSES } from "../../../shared/opportunities.mjs";
import { notificationsApi } from "../api/notifications";
import { subscribeFocus } from "../auth/focus-refresh";
import "./notifications.css";
import "../components/opportunities/opportunities.css";

const dateFormat = new Intl.DateTimeFormat("en-LR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Monrovia",
});

export default function NotificationsPage() {
  const [view, setView] = useState("all");
  return <><nav className="bw-op-tabs" aria-label="Notification views">{[["all", "All"], ["unread", "Unread"]].map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}</nav><Inbox key={view} view={view} /></>;
}
function Inbox({ view }) {
  const [inbox, setInbox] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState("");
  const request = useRef(null);

  const perform = useCallback(async (action, fetchData, onSuccess) => {
    if (request.current) return;
    const controller = new AbortController();
    const { signal } = controller;
    request.current = controller;
    setPending(action);
    try {
      const data = await fetchData(signal);
      if (signal.aborted) return;
      onSuccess(data);
      setError(null);
    } catch (failure) {
      if (signal.aborted) return;
      if ([401, 403].includes(failure.status)) setInbox(null);
      setError(failure);
    } finally {
      if (request.current === controller) {
        request.current = null;
        setPending("");
      }
    }
  }, []);

  const load = useCallback((cursor = null) => perform(
    "load",
    signal => notificationsApi.list(cursor, signal, view),
    data => setInbox(previous => cursor && previous
      ? { ...data, items: [...previous.items, ...data.items] }
      : data),
  ), [perform, view]);

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => { if (mounted) void load(); });
    const unsubscribe = subscribeFocus(() => { void load(); });
    return () => {
      mounted = false;
      request.current?.abort();
      request.current = null;
      unsubscribe();
    };
  }, [load]);

  function update(action, write, changeItems) {
    if (error) return;
    return perform(action, write, () => {
      setInbox(previous => previous && { ...previous, items: changeItems(previous.items) });
    });
  }

  function markRead(id) {
    return update("read:" + id, signal => notificationsApi.markRead(id, signal), items =>
      items.map(item => item.id === id ? { ...item, readAt: new Date().toISOString() } : item).filter(item => view !== "unread" || !item.readAt));
  }

  function markAllRead() {
    return update("read-all", notificationsApi.markAllRead, items => {
      const readAt = new Date().toISOString();
      return view === "unread" ? [] : items.map(item => item.readAt ? item : { ...item, readAt });
    });
  }

  function dismiss(id) {
    return update("dismiss:" + id, signal => notificationsApi.dismiss(id, signal), items =>
      items.filter(item => item.id !== id));
  }

  const disabled = Boolean(pending || error);
  return (
    <section className="bw-notifications" aria-busy={Boolean(pending)}>
      <header>
        <div>
          <p className="bw-notifications-eyebrow">YOUR BRIGHTWAY UPDATES</p>
          <h1>Notifications</h1>
          <p>Application decisions, profile views, and updates from your BrightWay network.</p>
        </div>
        {inbox?.items.some(item => !item.readAt) && (
          <button type="button" disabled={disabled} onClick={() => void markAllRead()}>
            {pending === "read-all" ? "Saving…" : "Mark all as read"}
          </button>
        )}
      </header>
      {error && (
        <div className="bw-notifications-error" role="alert">
          <p>{error.message}</p>
          <button type="button" disabled={Boolean(pending)} onClick={() => void load()}>
            {pending === "load" ? "Loading…" : "Reload notifications"}
          </button>
        </div>
      )}
      {!inbox && !error && <p role="status">Loading notifications…</p>}
      {inbox?.items.length === 0 && (
        <div className="bw-notifications-empty">
          <h2>You’re all caught up</h2>
          <p>New application updates and profile views will appear here.</p>
        </div>
      )}
      {inbox?.items.length > 0 && (
        <ul>
          {inbox.items.map(item => (
            <li className={item.readAt ? "is-read" : "is-unread"} key={item.id}>
              <span className="bw-notifications-dot" aria-hidden="true" />
              <div>
                <p>{item.kind === "APPLICATION_STATUS" ? <><Link to={`/applications/${item.application.id}`}><strong>{item.application.title}</strong></Link> · {APPLICATION_STATUSES[item.application.status]}</> : <><Link to={"/" + encodeURIComponent(item.viewer.username)}><strong>{item.viewer.fullName}</strong> (@{item.viewer.username})</Link> viewed your profile.</>}</p>
                <time dateTime={item.createdAt}>{dateFormat.format(new Date(item.createdAt))}</time>
              </div>
              <div className="bw-notifications-actions">
                {!item.readAt && (
                  <button type="button" disabled={disabled} onClick={() => void markRead(item.id)}>
                    {pending === "read:" + item.id ? "Saving…" : "Mark read"}
                  </button>
                )}
                <button type="button" disabled={disabled} onClick={() => void dismiss(item.id)}>
                  {pending === "dismiss:" + item.id ? "Saving…" : "Dismiss"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {inbox?.nextCursor && (
        <button className="bw-notifications-more" type="button" disabled={disabled} onClick={() => void load(inbox.nextCursor)}>
          {pending === "load" ? "Loading…" : "Load older notifications"}
        </button>
      )}
    </section>
  );
}
