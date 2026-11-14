import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { opportunitiesApi as api } from "../../api/opportunities";
import { CollaboratorIdentity } from "./ChallengeCollaboratorPicker";
import "./challenge-collaborators.css";

export default function ChallengeCollaborationInvites({ organizationId, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(false);
  const request = useRef(null);

  useEffect(() => () => request.current?.abort(), []);
  async function load() {
    if (loading || busy) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setError("");
    try {
      const data = await api.collaboratorInvitations(organizationId, controller.signal);
      if (!controller.signal.aborted) setRows(Array.isArray(data.items) ? data.items : []);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause.message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  async function respond(item, decision) {
    if (busy || disabled) return;
    setBusy(item.opportunityId); setError("");
    try {
      await api.respondCollaboration(organizationId, item.opportunityId, decision);
      setRows(old => old.map(row => row.opportunityId === item.opportunityId
        ? { ...row, state: decision } : row));
    } catch (cause) { setError(cause.message); }
    finally { setBusy(""); }
  }
  return <section className="bw-collaboration-invites" aria-label="Challenge collaboration invitations">
    <div className="bw-collaboration-invites-head">
      <div><h3>Challenge collaborations</h3><p>Review invitations from other BrightWay organizations.</p></div>
      <button type="button" disabled={disabled} aria-expanded={open}
        onClick={() => { setOpen(value => !value); if (!open) void load(); }}>
        {open ? "Hide invitations" : "Review invitations"}
      </button>
    </div>
    {open && <>
      {loading && <p role="status">Loading collaboration invitations…</p>}
      {error && <p role="alert">{error} <button type="button" onClick={() => void load()}>Try again</button></p>}
      {!loading && !error && rows.length === 0 && <p>No collaboration invitations.</p>}
      {!loading && rows.length > 0 && <ul>
        {rows.map(row => <li key={row.opportunityId}>
          <div>
            <CollaboratorIdentity organization={row.opportunity.organization} />
            <Link to={"/opportunities/" + encodeURIComponent(row.opportunityId)}>{row.opportunity.title}</Link>
            <small>{row.state === "ACCEPTED" ? "Accepted co-host" :
              row.state === "DECLINED" ? "Declined" : "Pending your decision"}</small>
          </div>
          {row.state === "PENDING" && <div className="bw-collaboration-invites-actions">
            <button type="button" disabled={Boolean(busy) || disabled}
              onClick={() => void respond(row, "ACCEPTED")}>Accept</button>
            <button type="button" disabled={Boolean(busy) || disabled}
              onClick={() => void respond(row, "DECLINED")}>Decline</button>
          </div>}
        </li>)}
      </ul>}
    </>}
  </section>;
}
