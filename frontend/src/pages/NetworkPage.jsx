import { useCallback, useEffect, useRef, useState } from "react";
import WorkspaceIcon from "../components/workspace/WorkspaceIcon";
const icon = name => function NetworkIcon(props) { return <WorkspaceIcon name={name} {...props} />; };
const UserRound = icon("people"), UsersRound = icon("people"), UserPlus = icon("plus"), Shield = icon("shield"), ArrowUpRight = icon("arrow"), ArrowDownLeft = icon("mail"), Search = icon("search");
import { useAuth } from "../auth/useAuth";
import { subscribeFocus } from "../auth/focus-refresh";
import { networkApi } from "../api/network";
import "./network.css";
const tabs = [["connections", "Connections", UsersRound], ["incoming", "Received", ArrowDownLeft], ["outgoing", "Sent", ArrowUpRight], ["blocked", "Blocked", Shield]];
const actions = { NONE: [["REQUEST", "Connect"]], OUTGOING: [["CANCEL", "Cancel request"]], INCOMING: [["ACCEPT", "Accept request"], ["DECLINE", "Decline request"]], CONNECTED: [["REMOVE", "Remove connection"]], BLOCKED: [["UNBLOCK", "Unblock person"]] };
const states = { NONE: "Not connected", OUTGOING: "Request sent", INCOMING: "Wants to connect", CONNECTED: "Connected", BLOCKED: "Blocked by you" };
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
  const [list, setList] = useState(null), [selection, setSelection] = useState(null), [username, setUsername] = useState("");
  const [error, setError] = useState(null), [refreshing, setRefreshing] = useState(false), [busy, setBusy] = useState(false), [lookupBusy, setLookupBusy] = useState(false), [notice, setNotice] = useState("");
  const [contact, setContact] = useState(null), [contactBusy, setContactBusy] = useState(false), [confirmation, setConfirmation] = useState(null);
  const lifetime = useRef(null), live = useRef(false), pending = useRef(false), mutation = useRef(false), selected = useRef(null), sequence = useRef(0), contactSequence = useRef(0), dialog = useRef(null), controller = useRef(null);
  const clearPrivate = useCallback(() => { sequence.current++; contactSequence.current++; selected.current = null; setSelection(null); setContact(null); setList(null); setConfirmation(null); }, []);
  const refresh = useCallback(async () => {
    if (!live.current || pending.current || mutation.current) return;
    pending.current = true; const currentController = new AbortController(); controller.current = currentController; setRefreshing(true); setContact(null); contactSequence.current++;
    const requestSequence = ++sequence.current;
    try {
      const [data, current] = await readTogether([networkApi.list(view, cursor, controller.current.signal), selected.current ? networkApi.person(selected.current.person.username, controller.current.signal).catch(e => { if (e.status === 404) return null; throw e; }) : null]);
      if (!live.current || requestSequence !== sequence.current) return;
      setList(data); selected.current = current; setSelection(current); setError(null);
    } catch (e) {
      if (!live.current || e.name === "AbortError" || requestSequence !== sequence.current) return;
      if (denied(e)) clearPrivate(); setError(e);
    } finally { if (live.current && controller.current === currentController) { pending.current = false; setRefreshing(false); } }
  }, [view, cursor, clearPrivate]);
  useEffect(() => {
    const current = {}, seq = sequence, contactSeq = contactSequence; lifetime.current = current; live.current = true;
    void Promise.resolve().then(() => { if (lifetime.current === current) void refresh(); });
    const off = subscribeFocus(refresh);
    return () => { lifetime.current = null; live.current = false; pending.current = false; seq.current++; contactSeq.current++; controller.current?.abort(); off(); };
  }, [refresh]);
  useEffect(() => { if (confirmation && !dialog.current?.open) dialog.current?.showModal(); }, [confirmation]);
  async function lookup(event, value) {
    event?.preventDefault(); if (mutation.current || lookupBusy || pending.current) return;
    const query = (value || username).trim().replace(/^@/, "").toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(query)) { setError({ message: "Enter an exact BrightWay username, using 3–30 letters, numbers or underscores." }); return; }
    const current = ++sequence.current; setLookupBusy(true); setContact(null); contactSequence.current++; setNotice("");
    try {
      const data = await networkApi.person(query);
      if (live.current && current === sequence.current) { selected.current = data; setSelection(data); setError(null); }
    } catch (e) { if (live.current && current === sequence.current) { selected.current = null; setSelection(null); if (denied(e)) clearPrivate(); setError(e); } }
    finally { if (live.current) setLookupBusy(false); }
  }
  async function save(action) {
    if (!selection || mutation.current || lookupBusy || pending.current || error) return;
    mutation.current = true; sequence.current++; contactSequence.current++; setBusy(true); setContact(null); setError(null); setNotice("");
    const target = selection.person.username, body = { action, expectedVersion: selection.relationship.version, requestKey: crypto.randomUUID() };
    try {
      await networkApi.action(target, body);
      if (!live.current) return;
      setConfirmation(null); dialog.current?.close();
      const [data, person] = await readTogether([networkApi.list(view, cursor), networkApi.person(target).catch(e => { if (e.status === 404) return null; throw e; })]);
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
    <form className="bw-network-search" onSubmit={lookup}>
      <label htmlFor="network-username">Connect by BrightWay username</label>
      <div><Search size={19} aria-hidden="true" /><input id="network-username" value={username} onChange={e => setUsername(e.target.value)} autoComplete="off" maxLength={31} placeholder="e.g. emmanuel" disabled={busy} /><button disabled={busy || refreshing || lookupBusy}>{lookupBusy ? "Finding…" : "Find person"}</button></div>
      <p>Only an accepted request creates a connection. Your organization memberships stay separate.</p>
    </form>
    <div className="bw-network-feedback" aria-live="polite">{notice && <p role="status">{notice}</p>}{refreshing && list && <p role="status">Refreshing your network…</p>}</div>
    {error && <div role="alert" className="bw-network-error"><p>{error.message}</p><button onClick={refresh} disabled={busy || refreshing}>Reload saved state</button><small>No action is automatically retried.</small></div>}
    <div className="bw-network-layout">
      <section className="bw-network-directory" aria-label={tabs.find(t => t[0] === view)[1]}>
        <header><h2>{tabs.find(t => t[0] === view)[1]}</h2><button onClick={refresh} disabled={busy || refreshing || lookupBusy}>Refresh</button></header>
        {!list && !error && <p role="status">Loading your network…</p>}
        {list?.items.length === 0 && <div className="bw-network-empty"><UsersRound size={32} aria-hidden="true" /><h3>{view === "connections" ? "Build meaningful connections" : "Nothing here yet"}</h3><p>{view === "connections" ? "Find someone by username and send a connection request." : "Requests and blocked people will appear in the appropriate view."}</p></div>}
        <ul>{list?.items.map(item => <li key={item.person.username}><button className="bw-network-person" disabled={busy || refreshing || lookupBusy} aria-pressed={selection?.person.username === item.person.username} onClick={() => lookup(null, item.person.username)}><span className="bw-network-symbol"><UserRound size={22} aria-hidden="true" /></span><span><strong>{item.person.fullName}</strong><small>@{item.person.username}</small><span>{states[item.relationship.state]}</span></span></button></li>)}</ul>
        {(cursor || list?.nextCursor) && <footer><button disabled={!cursor || busy || refreshing} onClick={() => { const previous = history.at(-1) || null; setHistory(history.slice(0, -1)); setCursor(previous); }}>Previous</button><button disabled={!list?.nextCursor || busy || refreshing} onClick={() => { setHistory([...history, cursor]); setCursor(list.nextCursor); }}>Next</button></footer>}
      </section>
      <section className="bw-network-detail" aria-label="Connection details">
        {!selection ? <div className="bw-network-empty"><UserPlus size={34} aria-hidden="true" /><h2>Your next connection</h2><p>Find a person or select someone from your network to see the available actions.</p></div> : <>
          <span className="bw-network-symbol"><UserRound size={27} aria-hidden="true" /></span><h2>{selection.person.fullName}</h2><p>@{selection.person.username}</p><span className="bw-network-state">{states[selection.relationship.state]}</span>
          <div className="bw-network-actions">{(actions[selection.relationship.state] || []).map(([action, label]) => <button key={action} disabled={disabled} onClick={() => choose(action)}>{busy ? "Saving…" : label}</button>)}{selection.relationship.state !== "BLOCKED" && <button className="is-secondary" disabled={disabled} onClick={() => choose("BLOCK")}>Block person</button>}</div>
          {selection.relationship.state === "BLOCKED" ? <p>Blocking ends any request or connection and hides shared contact details. Unblocking does not restore the connection.</p> : <><button disabled={disabled || contactBusy} onClick={sharedContact}>{contactBusy ? "Checking visibility…" : "View shared contact"}</button>{contact && <div className="bw-network-contact"><h3>Shared contact</h3>{Object.keys(contact).length === 0 ? <p>No contact details are shared with you.</p> : <dl>{[["email", "Email"], ["phoneNumber", "Phone"], ["whatsappNumber", "WhatsApp"]].filter(([key]) => contact[key]).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{contact[key]}</dd></div>)}</dl>}<small>Visibility is checked by the server every time. “Only me” fields remain private.</small></div>}</>}
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
