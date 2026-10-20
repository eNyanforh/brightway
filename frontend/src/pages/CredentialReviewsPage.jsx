import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { credentialsApi } from "../api/credentials";
import { CredentialTimeline } from "../components/profile/CredentialTimeline";
import { credentialLabels } from "./credential-form";
import "./credentials.css";
export default function CredentialReviewsPage() {
  const { account } = useAuth();
  const [queue, setQueue] = useState(null), [detail, setDetail] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false), [note, setNote] = useState(""), [status, setStatus] = useState("ACTION_REQUIRED");
  const locked = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    credentialsApi.queue(null, controller.signal).then(setQueue).catch((e) => { if (e.name !== "AbortError") setError(e); });
    return () => controller.abort();
  }, []);
  async function action(fn) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(e); }
    finally { locked.current = false; setBusy(false); }
  }
  async function open(id) { await action(async () => { setDetail(await credentialsApi.detail(id)); setNote(""); }); }
  const review = detail?.review;
  return <section className="bw-profile-card bw-credentials">
    <Link to="/profile">Back to profile</Link>
    <h1>Credential review workspace</h1>
    <p>Review each saved claim and its supporting evidence. These decisions do not grant individual Verified status.</p>
    {error && <p role="alert">{error.message}</p>}
    {!queue && !error && <p role="status">Checking reviewer access…</p>}
    {queue && <>
      <button type="button" disabled={busy} onClick={() => action(async () => { setQueue(await credentialsApi.queue()); if (review) setDetail(await credentialsApi.detail(review.id)); })}>Reload reviews</button>
      {!queue.reviews.length && <p>No credential submissions yet.</p>}
      <ul className="bw-review-queue">{queue.reviews.map((item) => <li key={item.id}>
        <button type="button" disabled={busy} onClick={() => open(item.id)}>{item.profile.person.firstName} {item.profile.person.lastName} · {item.kind} · {credentialLabels[item.status]}{item.overdue ? " · Past review target" : ""}</button>
      </li>)}</ul>
      {queue.nextCursor && <button type="button" disabled={busy} onClick={() => action(async () => setQueue(await credentialsApi.queue(queue.nextCursor)))}>Next page</button>}
    </>}
    {review && <div>
      <h2>Review for @{detail.username}</h2>
      <p>{credentialLabels[review.status]} · Revision {review.revision}</p>
      {review.attempts.length > 0 && <dl>{Object.entries(review.attempts.at(-1).snapshot).filter(([key]) => !["id", "revision", "status"].includes(key)).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value === null ? "—" : String(value)}</dd></div>)}</dl>}
      {review.status === "SUBMITTED" && <button type="button" className="bw-profile-button" disabled={busy} onClick={() => action(async () => { await credentialsApi.assign(review.id, review.version); setDetail(await credentialsApi.detail(review.id)); setQueue(await credentialsApi.queue()); })}>Assign to me and start review</button>}
      {review.status === "IN_REVIEW" && review.reviewerId === account.id && <form onSubmit={(event) => {
        event.preventDefault();
        action(async () => {
          await credentialsApi.decide(review.id, { expectedVersion: review.version, revision: review.revision, status, note });
          setDetail(await credentialsApi.detail(review.id)); setQueue(await credentialsApi.queue()); setNote("");
        });
      }}><fieldset disabled={busy}>
        <label htmlFor="credential-decision">Decision</label>
        <select id="credential-decision" value={status} onChange={(e) => setStatus(e.target.value)}>{["ACTION_REQUIRED", "VERIFIED", "UNABLE_TO_VERIFY", "FALSE_CREDENTIAL"].map((value) => <option key={value} value={value}>{credentialLabels[value]}</option>)}</select>
        <label htmlFor="credential-reason">Reason shown to the user</label>
        <textarea id="credential-reason" required minLength={10} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="bw-profile-button" disabled={busy || note.trim().length < 10 || error?.status === 409} type="submit">{busy ? "Saving decision…" : "Save review decision"}</button>
      </fieldset></form>}
      <CredentialTimeline review={review} onError={setError} allowDownload={review.reviewerId === account.id} />
    </div>}
  </section>;
}
