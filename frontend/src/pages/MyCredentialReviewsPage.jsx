import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { credentialsApi } from "../api/credentials";
import { credentialLabels } from "./credential-form";
import "./credentials.css";
export default function MyCredentialReviewsPage() {
  const [data, setData] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false);
  const locked = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    credentialsApi.ownerReviews(null, controller.signal).then(setData).catch((e) => { if (e.name !== "AbortError") setError(e); });
    return () => controller.abort();
  }, []);
  async function load(cursor) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(null);
    try { setData(await credentialsApi.ownerReviews(cursor)); } catch (e) { setError(e); }
    finally { locked.current = false; setBusy(false); }
  }
  return <section className="bw-profile-card bw-credentials">
    <Link to="/profile">Back to profile</Link>
    <h1>My credential reviews</h1>
    <p>Find reviewer feedback and earlier submissions here, including records removed from profile display.</p>
    {error && <p role="alert">{error.message}</p>}
    <button type="button" disabled={busy} onClick={() => load()}>Reload my reviews</button>
    {!data && !error && <p role="status">Loading your reviews…</p>}
    {data && <>
      {!data.reviews.length && <p>No credentials submitted yet. Open a saved education or experience record on your profile to submit supporting documents.</p>}
      <ul>{data.reviews.map((review) => <li key={review.id}>
        <Link to={`/credentials/${review.kind}/${review.recordId}`}>{review.attempts.at(-1)?.snapshot.qualification || review.attempts.at(-1)?.snapshot.role || review.kind} · {credentialLabels[review.status]}</Link>
        {review.note && <p>{review.note}</p>}
      </li>)}</ul>
      {data.nextCursor && <button type="button" disabled={busy} onClick={() => load(data.nextCursor)}>Next page</button>}
    </>}
  </section>;
}
