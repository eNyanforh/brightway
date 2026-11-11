import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { messagingApi, subscribeMessaging } from "../api/messaging";
import { memberPhotoUrl } from "../api/organization-posts";
import { useAuth } from "../auth/useAuth";
import { useManagement } from "../auth/management-context";
import VerificationBadge from "../components/VerificationBadge";
import NavigationIcon from "../components/layout/NavigationIcon";
import "./messages.css";

const time = value => new Intl.DateTimeFormat("en-LR", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Monrovia" }).format(new Date(value));
function Avatar({ person }) { return person?.photoId ? <img className="bw-message-avatar" src={memberPhotoUrl(person.username, person.photoId)} alt="" /> : <span className={`bw-message-avatar${person?.official ? " is-official" : ""}`} aria-hidden="true">{person?.official ? "B" : person?.fullName?.slice(0, 1) || "?"}</span>; }
export default function MessagesPage() { const { account } = useAuth(); const { id } = useParams(); return <Inbox key={`${account.id}:${id || "personal"}`} organizationId={id} />; }
export function OfficialMessagesPage() { const { staff } = useManagement(); return <Inbox key={staff.id} management />; }
function Inbox({ organizationId, management = false }) {
  const api = useMemo(() => messagingApi(management), [management]);
  const [params, setParams] = useSearchParams(), selected = params.get("conversation") || "";
  const [inbox, setInbox] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0), [presence, setPresence] = useState(null), [connection, setConnection] = useState("Connecting…"), [compose, setCompose] = useState(!!params.get("to"));
  const [preferences, setPreferences] = useState(null), [username, setUsername] = useState(params.get("to") || "");
  const listRequest = useRef(null);
  const load = useCallback(async cursor => {
    listRequest.current?.abort(); const controller = new AbortController(); listRequest.current = controller;
    try { const data = await api.list({ organizationId, cursor }, controller.signal); if (!controller.signal.aborted) { setInbox(old => cursor && old ? { ...data, items: [...old.items, ...data.items] } : data); setError(""); } }
    catch (e) { if (!controller.signal.aborted) { setError(e.message); if ([401, 403, 404].includes(e.status)) setInbox(null); } }
  }, [api, organizationId]);
  useEffect(() => { let alive = true; queueMicrotask(() => { if (alive) void load(); }); return () => { alive = false; listRequest.current?.abort(); }; }, [load]);
  useEffect(() => {
    if (management) return;
    let alive = true;
    api.preferences().then(v => { if (alive) setPreferences(v); }).catch(e => { if (alive) setError(e.message); });
    const beat = () => { if (document.visibilityState === "visible") void api.heartbeat().catch(() => {}); };
    beat(); const timer = setInterval(beat, 20000); document.addEventListener("visibilitychange", beat);
    return () => { alive = false; clearInterval(timer); document.removeEventListener("visibilitychange", beat); };
  }, [api, management]);
  useEffect(() => {
    let timer;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => { void load(); setRevision(v => v + 1); }, 120); };
    const close = subscribeMessaging({ organizationId, conversationId: selected || undefined }, (event, data) => {
      if (["notification:new", "notification:read"].includes(event)) window.dispatchEvent(new Event("brightway:notifications"));
      if (event === "presence:update") setPresence({ id: selected, value: data });
      else if (event === "access:changed") { setInbox(null); setRevision(v => v + 1); setError("Your messaging access changed. Refresh to check your current access."); }
      else if (event === "connection:reconnecting") setConnection("Reconnecting… your draft is kept");
      else if (event === "connection:open") setConnection("Live updates connected");
      else if (["sync", "message:new", "message:delivered", "message:read", "conversation:read"].includes(event)) refresh();
    }, management);
    return () => { close(); clearTimeout(timer); };
  }, [load, management, organizationId, selected]);
  const choose = id => { setPresence(null); setParams(id ? { conversation: id } : {}); setCompose(false); };
  async function open(e) {
    e.preventDefault(); if (busy) return; setBusy(true); setError("");
    try { const c = await api.open(username.trim().replace(/^@/, "")); choose(c.id); await load(); setUsername(""); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className={`bw-messages${selected ? " has-selection" : ""}`} aria-label={management ? "Official BrightWay messages" : "Messages"}>
    <header className="bw-messages-heading"><div><p>{management ? "BRIGHTWAY MANAGEMENT" : organizationId ? "OFFICIAL ORGANIZATION INBOX" : "YOUR CONVERSATIONS"}</p><h1>{management ? "Official messages" : "Messages"}</h1><span className="bw-messages-live" role="status">{connection}</span></div><button type="button" onClick={() => { setCompose(v => !v); }} aria-expanded={compose}><NavigationIcon name="messages" size={19} />{management ? "New official message" : "New message"}</button></header>
    {error && <p role="alert" className="bw-messages-error">{error} <button type="button" onClick={() => { void load(); setRevision(v => v + 1); }}>Refresh</button></p>}
    {compose && (management ? <OfficialComposer api={api} onSent={c => { choose(c.conversationId); void load(); }} /> : organizationId ? <p>Organizations can reply to official BrightWay conversations here. <Link to="/messages">Open your personal messages</Link> to contact your connections.</p> : <form className="bw-message-start" onSubmit={open}><label>Connected person’s username<input value={username} onChange={e => setUsername(e.target.value)} maxLength={30} required placeholder="@username" /></label><button disabled={busy} type="submit">{busy ? "Opening…" : "Start conversation"}</button><Link to="/network">Find a connection</Link></form>)}
    {!management && !organizationId && preferences && <details className="bw-message-privacy"><summary>Active status & typing</summary><p>You control whether connections see your active status and typing. Active status starts off.</p>{[["showActive", "Show Active now and Last active"], ["showTyping", "Show when I’m typing"]].map(([field, label]) => <label key={field}><input type="checkbox" checked={preferences[field]} disabled={busy} onChange={async e => { const next = { ...preferences, [field]: e.target.checked }; setBusy(true); try { setPreferences(await api.setPreferences(next)); } catch (e) { setError(e.message); } finally { setBusy(false); } }} />{label}</label>)}</details>}
    <div className="bw-messages-layout"><aside className="bw-message-inbox" aria-label="Conversations">
      <h2>Inbox</h2>{!inbox && !error && <p role="status">Loading conversations…</p>}{inbox?.items.length === 0 && <div className="bw-message-empty"><NavigationIcon name="messages" size={30} /><h3>Your next conversation starts here</h3><p>{organizationId ? "Official messages from BrightWay will appear here." : "Connect with someone in Network, then start a conversation."}</p></div>}
      <ul>{inbox?.items.map(c => <li key={c.id}><button type="button" aria-pressed={selected === c.id} onClick={() => choose(c.id)}><Avatar person={c.counterpart} /><span><strong>{c.counterpart.fullName}{c.counterpart.identityVerified && <VerificationBadge />}</strong><small>{c.latest?.body || (c.latest ? "Attachment or shared content" : "Start a conversation")}</small>{c.latest && <time dateTime={c.latest.createdAt}>{time(c.latest.createdAt)}</time>}</span>{c.unread > 0 && <b className="bw-message-unread" aria-label={`${c.unread} unread messages`}>{c.unread}</b>}</button></li>)}</ul>
      {inbox?.nextCursor && <button type="button" onClick={() => void load(inbox.nextCursor)}>More conversations</button>}
    </aside><div className="bw-message-thread-area">{selected ? <Thread key={selected} id={selected} organizationId={organizationId} api={api} management={management} revision={revision} presence={presence?.id === selected ? presence.value : null} onBack={() => choose("")} onSent={() => void load()} /> : <div className="bw-message-welcome"><span><NavigationIcon name="messages" size={38} /></span><h2>Stay connected. Keep growing.</h2><p>{management ? "Send an official update or open a conversation. Every official send records your staff identity." : "Choose a conversation to share ideas, achievements, and opportunities."}</p></div>}</div></div>
  </section>;
}
function OfficialComposer({ api, onSent, conversation }) {
  const [kind, setKind] = useState(conversation?.recipientKind || "USER"), [q, setQ] = useState(""), [results, setResults] = useState([]), [target, setTarget] = useState(null), [body, setBody] = useState(""), [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const attempt = useRef(null), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const edit = setter => e => { setter(e.target.value); attempt.current = null; };
  async function search(e) { e.preventDefault(); setBusy(true); try { setResults((await api.recipients(kind, q)).items); setError(""); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function send(e) {
    e.preventDefault(); if (busy) return;
    const recipientId = conversation?.recipientId || target?.id;
    if (!recipientId) return setError("Choose a recipient first.");
    const data = attempt.current || { recipientKind: kind, recipientId, body, reason, requestKey: crypto.randomUUID() }; attempt.current = data;
    setBusy(true); setError("");
    try { const c = await api.official(data); if (alive.current) { setBody(""); setReason(""); attempt.current = null; onSent(c); } }
    catch (e) { if (alive.current) setError(e.message + " Your message is kept; submit again to retry."); } finally { if (alive.current) setBusy(false); }
  }
  return <div className="bw-official-compose">{!conversation && <form onSubmit={search}><label>Recipient type<select value={kind} disabled={busy} onChange={e => { setKind(e.target.value); setResults([]); setTarget(null); attempt.current = null; }}><option value="USER">Individual</option><option value="ORGANIZATION">Organization</option></select></label><label>Find recipient<input value={q} onChange={edit(setQ)} minLength={2} maxLength={100} required /></label><button disabled={busy}>Search recipients</button><ul>{results.map(r => <li key={r.id}><button type="button" disabled={busy} aria-pressed={target?.id === r.id} onClick={() => { setTarget(r); attempt.current = null; }}>{r.label} {r.username && `(@${r.username})`}</button></li>)}</ul>{target && <p>To: <strong>{target.label}</strong></p>}</form>}
    <form onSubmit={send}><p className="bw-message-official-note">Public sender: <strong>BrightWay</strong>. Your staff identity and reason are kept in the internal audit.</p><label>Official message<textarea value={body} onChange={edit(setBody)} maxLength={4000} required disabled={busy} /></label><label>Internal reason<input value={reason} onChange={edit(setReason)} minLength={10} maxLength={1000} required disabled={busy} /></label><button disabled={busy || (!conversation && !target)}>{busy ? "Sending…" : error ? "Retry official message" : "Send as BrightWay"}</button>{error && <p role="alert">{error}</p>}</form></div>;
}
function Thread({ id, organizationId, api, management, revision, presence: livePresence, onBack, onSent }) {
  const [data, setData] = useState(null), [error, setError] = useState(""), [draft, setDraft] = useState(""), [files, setFiles] = useState([]), [shareUrl, setShareUrl] = useState(""), [sending, setSending] = useState(false), [uploading, setUploading] = useState(false), [failed, setFailed] = useState(false);
  const request = useRef(null), attempt = useRef(null), alive = useRef(true), lastTyping = useRef(0), readBoundary = useRef(null), end = useRef(null);
  const load = useCallback(async cursor => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    try {
      const next = await api.detail(id, cursor, controller.signal, organizationId); if (controller.signal.aborted) return;
      setData(old => { const rows = new Map([...(old?.items || []), ...next.items].map(m => [m.id, m])); return { ...next, nextCursor: cursor ? next.nextCursor : old?.nextCursor ?? next.nextCursor, items: [...rows.values()].sort((a,b) => a.sequence && b.sequence ? (BigInt(a.sequence) < BigInt(b.sequence) ? -1 : 1) : Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id)) }; }); setError("");
      const last = next.items.at(-1);
      if (last && next.items.some(m => !m.own && !m.deliveredAt)) void api.receipt(id, "DELIVERED", last.id).catch(e => { if (alive.current) setError(e.message); });
    } catch (e) { if (!controller.signal.aborted) { setError(e.message); if ([401, 403, 404].includes(e.status)) setData(null); } }
  }, [api, id, organizationId]);
  useEffect(() => { alive.current = true; let active = true; queueMicrotask(() => { if (active) void load(); }); return () => { active = false; alive.current = false; request.current?.abort(); if (!management) void api.typing(id, false).catch(() => {}); }; }, [id, load, management, api, revision]);
  useEffect(() => {
    const read = () => {
      const last = data?.items.at(-1);
      if (last && document.visibilityState === "visible" && document.hasFocus() && data.items.some(m => !m.own && !m.readAt) && readBoundary.current !== last.id) {
        readBoundary.current = last.id;
        void api.receipt(id, "READ", last.id).catch(e => { readBoundary.current = null; if (alive.current) setError(e.message); });
      }
    };
    read(); document.addEventListener("visibilitychange", read); window.addEventListener("focus", read);
    return () => { document.removeEventListener("visibilitychange", read); window.removeEventListener("focus", read); };
  }, [api, data, id]);
  useEffect(() => { if (!data?.nextCursor) end.current?.scrollIntoView?.({ block: "nearest" }); }, [data?.items.length, data?.nextCursor]);
  const edit = value => { setDraft(value); attempt.current = null; setFailed(false); if (!management && Date.now() - lastTyping.current > 2500) { lastTyping.current = Date.now(); void api.typing(id, !!value.trim()).catch(() => {}); } };
  async function upload(event) {
    const f = event.target.files?.[0]; event.target.value = ""; if (!f) return;
    if (f.size > 5 * 1024 * 1024) return setError("Choose an image or PDF up to 5 MiB.");
    setUploading(true); setError("");
    try { const saved = await api.upload(id, f); if (alive.current) { setFiles(old => [...old, saved]); attempt.current = null; } } catch (e) { if (alive.current) setError(e.message); } finally { if (alive.current) setUploading(false); }
  }
  async function send(e) {
    e.preventDefault(); if (sending || uploading) return; setSending(true); setError("");
    try {
      let payload = attempt.current;
      if (!payload) {
        let share;
        if (shareUrl.trim()) { const url = new URL(shareUrl.trim(), window.location.origin); if (![window.location.origin, "https://joinbrightway.me", "https://www.joinbrightway.me", "https://brightway-me.vercel.app"].includes(url.origin)) throw Error("Paste a BrightWay content link."); const resolved = await api.resolveShare(url.pathname + url.search); share = { kind: resolved.kind, id: resolved.id }; }
        payload = { body: draft, attachmentIds: files.map(f => f.id), ...(share ? { share } : {}), requestKey: crypto.randomUUID() }; attempt.current = payload;
      }
      await api.send(id, payload);
      if (alive.current) { setDraft(""); setFiles([]); setShareUrl(""); setFailed(false); attempt.current = null; await load(); onSent(); }
    } catch (e) { if (alive.current) { setFailed(true); setError(e.message); } } finally { if (alive.current) setSending(false); }
  }
  const presence = livePresence || data?.presence, c = data?.conversation;
  return <section className="bw-message-thread" aria-label="Selected conversation"><header><button className="bw-message-back" type="button" onClick={onBack}>← Inbox</button>{c && <><Avatar person={c.counterpart} /><div><h2>{c.counterpart.fullName}{c.counterpart.identityVerified && <VerificationBadge />}</h2><p>{c.kind !== "DIRECT" ? "Official BrightWay conversation" : presence?.typing ? "Typing…" : presence?.active ? "Active now" : presence?.lastActiveAt ? `Last active ${time(presence.lastActiveAt)}` : "Connected on BrightWay"}</p></div></>}</header>
    {error && <p className="bw-messages-error" role="alert">{error} <button type="button" onClick={() => void load()}>Reload conversation</button></p>}
    {!data && !error && <p role="status">Loading conversation…</p>}
    {data && <><div className="bw-message-history" aria-label="Message history">{data.nextCursor && <button type="button" onClick={() => void load(data.nextCursor)}>Load earlier messages</button>}{data.items.length === 0 && <p className="bw-message-empty">Say hello and start a purposeful conversation.</p>}
      <ol>{data.items.map(m => <li key={m.id} className={m.own ? "is-own" : ""}><div className="bw-message-bubble"><span className="bw-message-sender">{m.sender?.fullName}{m.sender?.identityVerified && <VerificationBadge />}{m.sender?.official && <b>Official</b>}</span>{m.body && <p>{m.body}</p>}{m.share && (m.share.unavailable ? <p>Shared content is no longer available.</p> : <Link className="bw-message-share" to={m.share.href}>{m.share.label} ↗</Link>)}{m.attachments.map(f => <a className="bw-message-file" key={f.id} href={api.fileUrl(id, f.id)} download>{f.contentType === "application/pdf" ? "PDF" : "Image"} · {f.name} · {Math.ceil(f.size / 1024)} KB ↓</a>)}<footer><time dateTime={m.createdAt}>{time(m.createdAt)}</time>{m.own && <span aria-label={`Message ${m.state.toLowerCase()}`}>{m.state === "READ" ? "✓✓ Read" : m.state === "DELIVERED" ? "✓✓ Delivered" : "✓ Sent"}</span>}</footer></div></li>)}</ol><div ref={end} /></div>
      {management ? <OfficialComposer api={api} conversation={c} onSent={() => { void load(); onSent(); }} /> : c.canSend ? <form className="bw-message-composer" onSubmit={send}><label className="bw-message-draft-label">Message<textarea value={draft} onChange={e => edit(e.target.value)} disabled={sending} placeholder="Write a message…" maxLength={4000} onBlur={() => void api.typing(id, false).catch(() => {})} /></label><div className="bw-message-attachments">{files.map(f => <span key={f.id}>{f.name}<button type="button" disabled={sending} aria-label={`Remove ${f.name}`} onClick={async () => { setUploading(true); try { await api.discardFile(id, f.id); if (alive.current) { setFiles(v => v.filter(x => x.id !== f.id)); attempt.current = null; } } catch (e) { if (alive.current) setError(e.message); } finally { if (alive.current) setUploading(false); } }}>×</button></span>)}</div><details><summary>Share BrightWay content</summary><label>Profile, post, organization, opportunity or program link<input value={shareUrl} disabled={sending} onChange={e => { setShareUrl(e.target.value); attempt.current = null; }} placeholder="Paste a BrightWay link" /></label></details><div className="bw-message-compose-actions"><label className="bw-message-attach"><input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" aria-label="Attach image or PDF" disabled={sending || uploading || files.length >= 4} onChange={upload} /><span>{uploading ? "Uploading…" : "＋ Image / PDF"}</span></label><small>{draft.length}/4,000</small><button type="submit" disabled={sending || uploading || (!draft.trim() && !files.length && !shareUrl.trim())}>{sending ? "Sending…" : failed ? "Retry message" : "Send"}</button></div>{failed && <p role="status">Failed to confirm send. Your draft is kept. Retry uses the same message key.</p>}</form> : <p className="bw-message-official-note">This connection has ended. Connect again to send new messages.</p>}</>}
  </section>;
}
