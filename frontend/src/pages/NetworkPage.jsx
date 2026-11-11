import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import WorkspaceIcon from "../components/workspace/WorkspaceIcon";
const icon = name => function NetworkIcon(props) { return <WorkspaceIcon name={name} {...props} />; };
const UserRound = icon("people"), UsersRound = icon("people"), UserPlus = icon("plus"), Shield = icon("shield"), ArrowUpRight = icon("arrow"), ArrowDownLeft = icon("mail"), Search = icon("search");
import { useAuth } from "../auth/useAuth";
import { subscribeFocus } from "../auth/focus-refresh";
import { networkApi } from "../api/network";
import "./network.css";
const tabs = [["connections", "Connections", UsersRound], ["incoming", "Received", ArrowDownLeft], ["outgoing", "Sent", ArrowUpRight], ["blocked", "Blocked", Shield], ["following", "Following", ArrowUpRight], ["followers", "Followers", UsersRound]];
const actions = { NONE: [["REQUEST", "Connect"]], OUTGOING: [["CANCEL", "Cancel request"]], INCOMING: [["ACCEPT", "Accept request"], ["DECLINE", "Decline request"]], CONNECTED: [["REMOVE", "Remove connection"]], BLOCKED: [["UNBLOCK", "Unblock person"]] };
const states = { FOLLOWING: "Following", FOLLOWS_YOU: "Follows you", NONE: "Not connected", OUTGOING: "Request sent", INCOMING: "Wants to connect", CONNECTED: "Connected", BLOCKED: "Blocked by you" };
const denied = error => [401, 403].includes(error?.status);
async function readTogether(reads) {
  const results = await Promise.allSettled(reads);
  const errors = results.filter(result => result.status === "rejected").map(result => result.reason);
  // A 401/403 invalidates shared reads and may abort its sibling before its
  // response body finishes. Preserve the authoritative denial over AbortError.
  const error = errors.find(denied) || errors.find(value => value.name !== "AbortError") || errors[0];
  if (error) throw error;
  return results.map(result => result.value);
}

function NetworkPanel({ view, cursor, setCursor, history, setHistory }) {
  const [targetKind, setTargetKind] = useState("PERSON");
  const [list, setList] = useState(null), [selection, setSelection] = useState(null), [username, setUsername] = useState("");
  const [error, setError] = useState(null), [refreshing, setRefreshing] = useState(false), [busy, setBusy] = useState(false), [lookupBusy, setLookupBusy] = useState(false), [notice, setNotice] = useState("");
  const [contact, setContact] = useState(null), [contactBusy, setContactBusy] = useState(false), [confirmation, setConfirmation] = useState(null);
  const lifetime = useRef(null), live = useRef(false), pending = useRef(false), mutation = useRef(false), selected = useRef(null), sequence = useRef(0), contactSequence = useRef(0), dialog = useRef(null), controller = useRef(null);
  const clearPrivate = useCallback(() => { sequence.current++; contactSequence.current++; selected.current = null; setSelection(null); setContact(null); setList(null); setConfirmation(null); }, []);
  const getTarget = useCallback((username, kind = "PERSON", signal) => kind === "ORGANIZATION" || ["following", "followers"].includes(view) ? networkApi.followTarget(kind, username, signal) : networkApi.person(username, signal), [view]);
  const refresh = useCallback(async () => {
    if (!live.current || pending.current || mutation.current) return;
    pending.current = true; const currentController = new AbortController(); controller.current = currentController; setRefreshing(true); setContact(null); contactSequence.current++;
    const requestSequence = ++sequence.current;
    try {
      const [data, current] = await readTogether([networkApi.list(view, cursor, controller.current.signal), selected.current ? getTarget(selected.current.person.username, selected.current.kind || "PERSON", controller.current.signal).catch(e => { if (e.status === 404) return null; throw e; }) : null]);
      if (!live.current || requestSequence !== sequence.current) return;
      setList(data); selected.current = current; setSelection(current); setError(null);
    } catch (e) {
      if (!live.current || e.name === "AbortError" || requestSequence !== sequence.current) return;
      if (denied(e)) clearPrivate(); setError(e);
    } finally { if (live.current && controller.current === currentController) { pending.current = false; setRefreshing(false); } }
  }, [view, cursor, clearPrivate, getTarget]);
  useEffect(() => {
    const current = {}, seq = sequence, contactSeq = contactSequence; lifetime.current = current; live.current = true;
    void Promise.resolve().then(() => { if (lifetime.current === current) void refresh(); });
    const off = subscribeFocus(refresh);
    return () => { lifetime.current = null; live.current = false; pending.current = false; seq.current++; contactSeq.current++; controller.current?.abort(); off(); };
  }, [refresh]);
  useEffect(() => { if (confirmation && !dialog.current?.open) dialog.current?.showModal(); }, [confirmation]);
  async function lookup(event, value, kind = targetKind) {
    event?.preventDefault(); if (mutation.current || lookupBusy || pending.current) return;
    const query = (value || username).trim().replace(/^@/, "").toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(query)) { setError({ message: "Enter an exact BrightWay username, using 3–30 letters, numbers or underscores." }); return; }
    const current = ++sequence.current; setLookupBusy(true); setContact(null); contactSequence.current++; setNotice("");
    try {
      const data = await getTarget(query, kind);
      if (live.current && current === sequence.current) { selected.current = data; setSelection(data); setError(null); }
    } catch (e) { if (live.current && current === sequence.current) { selected.current = null; setSelection(null); if (denied(e)) clearPrivate(); setError(e); } }
    finally { if (live.current) setLookupBusy(false); }
  }
  async function save(action) {
    if (!selection || mutation.current || lookupBusy || pending.current || error) return;
    mutation.current = true; sequence.current++; contactSequence.current++; setBusy(true); setContact(null); setError(null); setNotice("");
    const target = selection.person.username, kind = selection.kind || "PERSON", followAction = ["FOLLOW", "UNFOLLOW"].includes(action);
    const body = { action, expectedVersion: followAction ? selection.follow.version : selection.relationship.version, requestKey: crypto.randomUUID(), ...(followAction ? { targetRef: selection.follow.targetRef } : {}) };
    try {
      if (followAction) await networkApi.followAction(kind, target, body); else await networkApi.action(target, body);
      if (!live.current) return;
      setConfirmation(null); dialog.current?.close();
      const [data, person] = await readTogether([networkApi.list(view, cursor), getTarget(target, kind).catch(e => { if (e.status === 404) return null; throw e; })]);
      if (!live.current) return;
      setList(data); selected.current = person; setSelection(person); setNotice("Network updated.");
    } catch (e) { if (live.current) { setConfirmation(null); dialog.current?.close(); if (denied(e)) clearPrivate(); setError(e); } }
    finally { mutation.current = false; if (live.current) setBusy(false); }
  }
  function choose(action) { if (["BLOCK", "REMOVE"].includes(action)) setConfirmation(action); else void save(action); }
  async function sharedContact() {
    if (!selection || mutation.current || error || contactBusy) return;
    const current = ++contactSequence.current, target = selection.person.username; setContactBusy(true); setContact(null);
    try { const value = await networkApi.contact(target); if (live.current && current === contactSequence.current && selected.current?.person.username === target) setContact(value); }
    catch (e) { if (live.current && current === contactSequence.current) { if (denied(e)) clearPrivate(); setError(e); } }
    finally { if (live.current) setContactBusy(false); }
  }
  const disabled = busy || refreshing || lookupBusy || !!error;
  return <>
    <form className="bw-network-search" onSubmit={event => lookup(event)}>
      <label htmlFor="network-target-kind">Look for</label><select id="network-target-kind" value={targetKind} disabled={busy || lookupBusy || refreshing} onChange={e => { setTargetKind(e.target.value); sequence.current++; contactSequence.current++; selected.current = null; setSelection(null); setContact(null); setNotice(""); }}><option value="PERSON">People</option><option value="ORGANIZATION">Organizations</option></select>
      <label htmlFor="network-username">{targetKind === "PERSON" ? "Connect by BrightWay username" : "Organization username"}</label>
      <div><Search size={19} aria-hidden="true" /><input id="network-username" value={username} onChange={e => setUsername(e.target.value)} autoComplete="off" maxLength={31} placeholder="e.g. emmanuel" disabled={busy} /><button disabled={busy || refreshing || lookupBusy}>{lookupBusy ? "Finding…" : targetKind === "ORGANIZATION" ? "Find organization" : "Find person"}</button></div>
      <p>Following is separate from connecting. Only an accepted connection can unlock connections-only contact details.</p>
    </form>
    <div className="bw-network-feedback" aria-live="polite">{notice && <p role="status">{notice}</p>}{refreshing && list && <p role="status">Refreshing your network…</p>}</div>
    {error && <div role="alert" className="bw-network-error"><p>{error.message}</p><button onClick={refresh} disabled={busy || refreshing}>Reload saved state</button><small>No action is automatically retried.</small></div>}
    <div className="bw-network-layout">
      <section className="bw-network-directory" aria-label={tabs.find(t => t[0] === view)[1]}>
        <header><h2>{tabs.find(t => t[0] === view)[1]}</h2><button onClick={refresh} disabled={busy || refreshing || lookupBusy}>Refresh</button></header>
        {!list && !error && <p role="status">Loading your network…</p>}
        {list?.items.length === 0 && <div className="bw-network-empty"><UsersRound size={32} aria-hidden="true" /><h3>{view === "connections" ? "Build meaningful connections" : "Nothing here yet"}</h3><p>{view === "connections" ? "Find someone by username and send a connection request." : ["following", "followers"].includes(view) ? "The people and organizations in this view will appear here." : "Requests and blocked people will appear in the appropriate view."}</p></div>}
        <ul>{list?.items.map(item => <li key={`${item.kind || "PERSON"}:${item.person.username}`}><button className="bw-network-person" disabled={busy || refreshing || lookupBusy} aria-pressed={selection?.person.username === item.person.username && (selection.kind || "PERSON") === (item.kind || "PERSON")} onClick={() => lookup(null, item.person.username, item.kind || "PERSON")}><span className="bw-network-symbol"><UserRound size={22} aria-hidden="true" /></span><span><strong>{item.person.fullName}</strong><small>@{item.person.username}{item.kind === "ORGANIZATION" ? " · Organization" : ""}</small><span>{item.available === false ? "Currently unavailable" : states[item.relationship.state]}</span></span></button></li>)}</ul>
        {(cursor || list?.nextCursor) && <footer><button disabled={!cursor || busy || refreshing} onClick={() => { const previous = history.at(-1) || null; setHistory(history.slice(0, -1)); setCursor(previous); }}>Previous</button><button disabled={!list?.nextCursor || busy || refreshing} onClick={() => { setHistory([...history, cursor]); setCursor(list.nextCursor); }}>Next</button></footer>}
      </section>
      <section className="bw-network-detail" aria-label="Connection details">
        {!selection ? <div className="bw-network-empty"><UserPlus size={34} aria-hidden="true" /><h2>Your next connection</h2><p>Find a person or select someone from your network to see the available actions.</p></div> : <>
          <span className="bw-network-symbol"><UserRound size={27} aria-hidden="true" /></span><h2>{selection.person.fullName}</h2><p>@{selection.person.username}</p><span className="bw-network-state">{selection.available === false ? "Currently unavailable" : selection.kind === "ORGANIZATION" ? "Organization" : states[selection.relationship.state]}</span>
          {selection.follow && selection.relationship.state !== "BLOCKED" && <div className="bw-network-follow"><button disabled={disabled || (!selection.follow.active && selection.available === false)} onClick={() => save(selection.follow.active ? "UNFOLLOW" : "FOLLOW")}>{busy ? "Saving…" : selection.follow.active ? "Unfollow" : "Follow"}</button><p>Following does not create a connection or grant private contacts, membership or review permissions.</p></div>}
          {selection.kind === "ORGANIZATION" ? selection.publicUrl && <a className="bw-network-public-link" href={selection.publicUrl} target="_blank" rel="noopener noreferrer" aria-label="View organization profile (opens in a new tab)">View organization profile</a> : (selection.available !== false || selection.relationship.state === "BLOCKED") && <><div className="bw-network-actions">{(actions[selection.relationship.state] || []).map(([action, label]) => <button key={action} disabled={disabled} onClick={() => choose(action)}>{busy ? "Saving…" : label}</button>)}{selection.relationship.state !== "BLOCKED" && <button className="is-secondary" disabled={disabled} onClick={() => choose("BLOCK")}>Block person</button>}</div>
          {selection.relationship.state === "CONNECTED" && <Link className="bw-network-public-link" to={`/messages?to=${encodeURIComponent(selection.person.username)}`}>Message</Link>}
          {selection.relationship.state !== "BLOCKED" && <Link className="bw-network-public-link" to={`/${encodeURIComponent(selection.person.username)}`}>View profile</Link>}
          {selection.relationship.state === "BLOCKED" ? <p>Blocking ends any request or connection and hides shared contact details. Unblocking does not restore the connection.</p> : <><button disabled={disabled || contactBusy} onClick={sharedContact}>{contactBusy ? "Checking visibility…" : "View shared contact"}</button>{contact && <div className="bw-network-contact"><h3>Shared contact</h3>{Object.keys(contact).length === 0 ? <p>No contact details are shared with you.</p> : <dl>{[["email", "Email"], ["phoneNumber", "Phone"], ["whatsappNumber", "WhatsApp"]].filter(([key]) => contact[key]).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{contact[key]}</dd></div>)}</dl>}<small>Visibility is checked by the server every time. “Only me” fields remain private.</small></div>}</>}
          </>}
        </>}
      </section>
    </div>
    {confirmation && <dialog className="bw-network-dialog" ref={dialog} onCancel={e => { if (busy) e.preventDefault(); else setConfirmation(null); }} aria-labelledby="network-confirm-title"><h2 id="network-confirm-title">{confirmation === "BLOCK" ? "Block this person?" : "Remove this connection?"}</h2><p>{confirmation === "BLOCK" ? "This ends any request or connection and prevents contact sharing between your accounts. They will not receive a blocking notification." : "Connections-only contact details will stop being shared. A new request requires acceptance again."}</p><div><button disabled={busy} onClick={() => { dialog.current?.close(); setConfirmation(null); }}>Keep current settings</button><button disabled={disabled} onClick={() => save(confirmation)}>{busy ? "Saving…" : confirmation === "BLOCK" ? "Confirm block" : "Confirm removal"}</button></div></dialog>}
  </>;
}
export default function NetworkPage() {
  const { account } = useAuth(); const [view, setView] = useState("connections"), [cursor, setCursor] = useState(null), [history, setHistory] = useState([]);
  return <section className="bw-network"><header className="bw-network-heading"><span><UsersRound size={25} aria-hidden="true" /></span><div><p>PEOPLE & CONNECTIONS</p><h1>Network</h1><p>Build professional connections on BrightWay.</p></div></header><nav className="bw-network-tabs" aria-label="Network views">{tabs.map(([key, label, Icon]) => <button key={key} aria-current={view === key ? "page" : undefined} onClick={() => { setView(key); setCursor(null); setHistory([]); }}><Icon size={18} aria-hidden="true" />{label}</button>)}</nav><NetworkPanel key={`${account.id}:${view}:${cursor || "first"}`} view={view} cursor={cursor} setCursor={setCursor} history={history} setHistory={setHistory} /></section>;
}
