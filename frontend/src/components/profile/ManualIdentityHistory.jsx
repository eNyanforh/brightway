import { identityDate, identityLabels, imageLabels } from "../../pages/manual-identity-format";
export default function ManualIdentityHistory({ attempts, onDownload, busy }) {
  return <div className="bw-identity-history"><h2>Submission history</h2>
    {!attempts.length && <p>No identity requests submitted yet.</p>}
    {attempts.map((attempt) => <article key={attempt.id}>
      <h3>Submission {attempt.revision} · {identityLabels[attempt.state] || attempt.state}</h3>
      <p>Submitted {identityDate(attempt.submittedAt)} · Review target {identityDate(attempt.targetAt)}</p>
      {attempt.note && <p><strong>Reviewer feedback:</strong> {attempt.note}</p>}
      {attempt.decidedAt && <p>Decision {identityDate(attempt.decidedAt)}</p>}
      {attempt.snapshot && <dl>{Object.entries(attempt.snapshot).filter(([key]) => !/Revision$|photoId/.test(key)).map(([key, value]) => <div key={key}><dt>{key.replace(/([A-Z])/g, " $1")}</dt><dd>{value == null || value === "" ? "—" : String(value)}</dd></div>)}</dl>}
      {attempt.evidence.map((asset) => <button type="button" key={asset.id} disabled={busy} onClick={() => onDownload(asset.id)}>Download {imageLabels[asset.kind] || "identity image"} · submission {attempt.revision}</button>)}
      <p className="bw-identity-muted">{attempt.purgedAt ? "Identity images and snapshot have been removed under the retention policy." : `Private images and snapshot are available until ${identityDate(attempt.purgeAt)}. Access may end earlier if permission changes.`}</p>
    </article>)}
  </div>;
}
