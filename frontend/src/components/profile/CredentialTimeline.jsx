import { credentialsApi } from "../../api/credentials";
import { credentialLabels } from "../../pages/credential-form";
const date = (value) => new Date(value).toLocaleDateString();
export function CredentialTimeline({ review, onError, allowDownload = true }) {
  return <div className="bw-credential-timeline">
    <h2>Review history</h2>
    <p>Review target: {date(review.targetAt)}. This is a target, not a guaranteed completion date.</p>
    {review.hiddenFromPublic && <p>This credential is excluded from public display until resolved.</p>}
    {review.note && <p><strong>Reviewer feedback:</strong> {review.note}</p>}
    {review.attempts.map((attempt, index) => <article key={attempt.id}>
      <h3>Submission {index + 1} · Revision {attempt.revision}</h3>
      <p>Reviewing issuer: {attempt.issuerName || "BrightWay (unlisted issuer)"}</p>
      <p>{credentialLabels[attempt.status]} · {date(attempt.createdAt)}</p>
      {attempt.note && <p>{attempt.note}</p>}
      <ul>{attempt.evidence.map((asset, i) => <li key={asset.id}><button type="button" disabled={!allowDownload} className="bw-profile-text-button" onClick={() => credentialsApi.download(asset.id, asset.contentType).catch(onError)}>Download supporting document {i + 1} ({Math.ceil(asset.size / 1024)} KiB)</button></li>)}</ul>
    </article>)}
    <h3>Audit timeline</h3>
    <ol>{review.events.map((event) => <li key={event.id}>{credentialLabels[event.fromStatus]} → {credentialLabels[event.toStatus]} · {date(event.createdAt)}{event.actorId && <small> · Actor {event.actorId}</small>}{event.note && <p>{event.note}</p>}</li>)}</ol>
  </div>;
}
