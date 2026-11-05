import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { notificationsApi } from "../api/notifications";
import { subscribeFocus } from "../auth/focus-refresh";
import "./notifications.css";

const denied = error => [401, 403].includes(error?.status);
const dateLabel = value => new Intl.DateTimeFormat("en-LR", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Monrovia" }).format(new Date(value));

export default function NotificationsPage() {
  const [items, setItems] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busyIds, setBusyIds] = useState([]);
  const pending = useRef(false);
  const live = useRef(false);

  const load = useCallback(async (cursor = null, append = false) => {
    if (pending.current || !live.current) return;
    pending.current = true; setLoading(true);
    try {
      const data = await notificationsApi.list(cursor);
      if (!live.current) return;
      setItems(previous => append ? [...(previous || []), ...data.items] : data.items);
      setNextCursor(data.nextCursor); setError(null);
    } catch (value) {
      if (!live.current || value.name === "AbortError") return;
      if (denied(value)) { setItems(null); setNextCursor(null); }
      setError(value);
    } finally { pending.current = false; if (live.current) setLoading(false); }
  }, []);

  useEffect(() => {
    live.current = true;
    void load();
    const unsubscribe = subscribeFocus(() => { if (!pending.current) void load(); });
    return () => { live.current = false; pending.current = false; unsubscribe(); };
  }, [load]);

  async function markRead(item) {
    if (item.readAt || busyIds.includes(item.id)) return;
    setBusyIds(previous => [...previous, item.id]);
    try {
      await notificationsApi.markRead(item.id);
      setItems(previous => previous?.map(entry => entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry));
      setError(null);
    } catch (value) { setError(value); }
    finally { setBusyIds(previous => previous.filter(id => id !== item.id)); }
  }

  async function markAllRead() {
    if (!items?.some(item => !item.readAt) || busyIds.includes("all")) return;
    setBusyIds(previous => [...previous, "all"]);
    try {
      await notificationsApi.markAllRead();
      const readAt = new Date().toISOString();
      setItems(previous => previous?.map(item => item.readAt ? item : { ...item, readAt }));
      setError(null);
    } catch (value) { setError(value); }
    finally { setBusyIds(previous => previous.filter(id => id !== "all")); }
  }

  async function dismiss(item) {
    if (busyIds.includes(item.id)) return;
    setBusyIds(previous => [...previous, item.id]);
    try {
      await notificationsApi.dismiss(item.id);
      setItems(previous => previous?.filter(entry => entry.id !== item.id));
      setError(null);
    } catch (value) { setError(value); }
    finally { setBusyIds(previous => previous.filter(id => id !== item.id)); }
  }

  return <section className="bw-notifications">
    <header><div><p className="bw-notifications-eyebrow">YOUR BRIGHTWAY UPDATES</p><h1>Notifications</h1><p>Profile view updates are shared only when both people have opted in.</p></div>
      {items?.some(item => !item.readAt) && <button type="button" disabled={busyIds.includes("all")} onClick={markAllRead}>{busyIds.includes("all") ? "Saving…" : "Mark all as read"}</button>}
    </header>
    {error && <div className="bw-notifications-error" role="alert"><p>{error.message}</p><button type="button" disabled={loading} onClick={() => void load()}>{loading ? "Loading…" : "Reload notifications"}</button></div>}
    {!items && !error && <p role="status">Loading notifications…</p>}
    {items?.length === 0 && <div className="bw-notifications-empty"><h2>You’re all caught up</h2><p>When someone who has opted in views your published profile, the update will appear here.</p><Link to="/profile">Review your profile privacy choices</Link></div>}
    {items?.length > 0 && <ul>{items.map(item => <li className={item.readAt ? "is-read" : "is-unread"} key={item.id}>
      <span className="bw-notifications-dot" aria-hidden="true" />
      <div><p><Link to={`/people/${encodeURIComponent(item.viewer.username)}`}><strong>{item.viewer.fullName}</strong> (@{item.viewer.username})</Link> viewed your profile.</p><time dateTime={item.createdAt}>{dateLabel(item.createdAt)}</time></div>
      <div className="bw-notifications-actions">{!item.readAt && <button type="button" disabled={busyIds.includes(item.id)} onClick={() => void markRead(item)}>{busyIds.includes(item.id) ? "Saving…" : "Mark read"}</button>}<button type="button" disabled={busyIds.includes(item.id)} onClick={() => void dismiss(item)}>{busyIds.includes(item.id) ? "Saving…" : "Dismiss"}</button></div>
    </li>)}</ul>}
    {nextCursor && <button className="bw-notifications-more" type="button" disabled={loading} onClick={() => void load(nextCursor, true)}>{loading ? "Loading…" : "Load older notifications"}</button>}
  </section>;
}
