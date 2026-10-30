import { useRef, useState } from "react";
import { credentialsApi } from "../../api/credentials";
import { credentialLabels } from "../../pages/credential-form";
import { claimFields, claimTitle, reviewDate } from "./review-presentation";

export function ReviewIcon({ name = "document", size = 18 }) {
  const shapes = {
    document: <><path d="M14 3H5v18h14V8l-5-5Z" /><path d="M14 3v5h5M8 12h8M8 16h6" /></>,
    education: <><path d="m2 8 10-5 10 5-10 5-10-5Zm4 3v6c4 3 8 3 12 0v-6M22 8v8" /></>,
    work: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V3h8v4M3 12c5 3 13 3 18 0M10 13h4" /></>,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
    inbox: <><path d="m6 4-4 10v6h20v-6L18 4H6Z" /><path d="M2 14h6l2 3h4l2-3h6" /></>,
    person: <><circle cx="12" cy="7" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
    search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6" /></>,
    alert: <><path d="m12 3 10 18H2L12 3Z" /><path d="M12 9v5m0 3v1" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{shapes[name] || shapes.document}</svg>;
}
export function ReviewStatus({ status }) { return <span className={`bw-review-status status-${status || "DRAFT"}`}><i />{credentialLabels[status] || "Status unavailable"}</span>; }
function Evidence({ attempt, allowed, disabled, onError }) {
  const lock = useRef(false), [pending, setPending] = useState(null);
  async function download(asset) {
    if (!allowed || disabled || lock.current) return;
    lock.current = true; setPending(asset.id);
    try { await credentialsApi.download(asset.id, asset.contentType); }
    catch (error) { onError(error, error.status === 409); }
    finally { lock.current = false; setPending(null); }
  }
  return <ul className="bw-review-evidence">{(attempt?.evidence || []).map((asset, index) => <li key={asset.id}><span className={`bw-review-file-icon${asset.contentType === "application/pdf" ? " is-pdf" : ""}`}><ReviewIcon name="document" size={22} /></span><div><strong>Supporting document {index + 1}</strong><small>{asset.contentType === "application/pdf" ? "PDF document" : "WebP image"} · {Number.isFinite(asset.size) ? `${Math.ceil(asset.size / 1024)} KiB` : "Size unavailable"}</small></div><button type="button" className="bw-review-file-download" aria-label={`Download supporting document ${index + 1}`} disabled={!allowed || disabled || !!pending} onClick={() => download(asset)}><ReviewIcon name="download" /><span>{pending === asset.id ? "Downloading…" : "Download"}</span></button></li>)}</ul>;
}
const decisionDescriptions = {
  ACTION_REQUIRED: "Ask the applicant to correct or clarify the saved claim. Explain exactly what they need to change.",
  VERIFIED: "Confirm that the submitted credential is authentic. This verifies this credential only.",
  UNABLE_TO_VERIFY: "Explain why you could not establish authenticity from the available information.",
  FALSE_CREDENTIAL: "Record a supported finding that the credential is false. It will be excluded from profile display.",
};
export function ReviewDetail({ detail, name, accountId, headingRef, busy, stale, decision, note, onNote, onDecision, onAssign, onSave, onClose, onError, isBusy }) {
  const review = detail.review, latest = review.attempts?.at(-1), [confirmed, setConfirmed] = useState(false);
  const own = review.reviewerId === accountId, canDecide = review.status === "IN_REVIEW" && own, canDownload = own && !stale;
  const fields = claimFields(latest?.snapshot), blocked = busy || stale;
  return <article className="bw-review-detail">
    <header className="bw-review-detail-header"><div><p className="bw-review-eyebrow">{review.kind === "experience" ? "EXPERIENCE" : "EDUCATION"} SUBMISSION</p><h2 ref={headingRef} tabIndex={-1}>{name}</h2><p>{claimTitle(review)}</p></div><button type="button" className="bw-review-close" aria-label="Close selected review" disabled={busy} onClick={onClose}><ReviewIcon name="close" size={20} /></button></header>
    <div className="bw-review-detail-meta"><ReviewStatus status={review.status} /><span>Revision {review.revision}</span><span>{review.reviewerId ? own ? "Assigned to you" : "Assigned to another reviewer" : "Unassigned"}</span></div>
    <div className="bw-review-detail-body">
      <section className="bw-review-claim" aria-label="Saved credential claim"><div className="bw-review-section-title"><span><ReviewIcon name={review.kind === "experience" ? "work" : "education"} /></span><div><h3>Submitted claim</h3><p>The saved information attached to this revision</p></div></div><dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{!fields.length && <p>No claim details were returned. Reload before deciding.</p>}<div className="bw-review-issuer"><ReviewIcon name="shield" /><p><small>Reviewing issuer</small><strong>{review.issuerName || "BrightWay (unlisted issuer)"}</strong></p></div></section>
      <div className="bw-review-target"><ReviewIcon name="clock" /><div><strong>Review target · {reviewDate(review.targetAt)} UTC</strong><p>A target, not a guaranteed completion date. Corrections keep the original timeline.</p></div></div>
      <section aria-label="Supporting evidence"><div className="bw-review-section-title"><span><ReviewIcon name="document" /></span><div><h3>Supporting documents <small>{latest?.evidence?.length || 0}</small></h3><p>Private files supplied with this submission</p></div></div>{!canDownload && <p className="bw-review-evidence-lock"><ReviewIcon name="lock" size={15} />{stale ? "Reload reviews to recheck evidence access." : own ? "Evidence access is being checked." : "Assign this review to yourself before downloading evidence."}</p>}<Evidence key={`${review.id}:${review.version}`} attempt={latest} allowed={canDownload} disabled={busy} onError={onError} />{!latest?.evidence?.length && <p className="bw-review-muted">No supporting documents were returned for this submission.</p>}</section>
      {(review.status === "SUBMITTED" || detail.canReassign) && <div className="bw-review-assignment"><span><ReviewIcon name="person" size={24} /></span><div><h3>{detail.canReassign ? "Continue an unassigned responsibility" : "Ready to review?"}</h3><p>{detail.canReassign ? "The previous reviewer is no longer authorized. Take ownership to continue." : "Take ownership before accessing private documents and recording a decision."}</p><button type="button" disabled={blocked} onClick={() => { if (!isBusy()) onAssign(); }}>{detail.canReassign ? "Reassign withdrawn review to me" : "Assign to me and start review"}<ReviewIcon name="arrow" size={16} /></button></div></div>}
      {canDecide && <form className="bw-review-decision" onSubmit={event => { event.preventDefault(); if (!blocked && !isBusy() && note.trim().length >= 10 && (decision !== "FALSE_CREDENTIAL" || confirmed)) onSave(); }}>
        <div className="bw-review-section-title"><span><ReviewIcon name="check" /></span><div><h3>Your review decision</h3><p>Be specific, fair and clear with the applicant</p></div></div>
        <fieldset disabled={busy}><label htmlFor="credential-decision">Decision</label><select id="credential-decision" value={decision} disabled={stale} onChange={event => { setConfirmed(false); onDecision(event.target.value); }}>{Object.keys(decisionDescriptions).map(value => <option key={value} value={value}>{credentialLabels[value]}</option>)}</select><p className={`bw-review-decision-explainer decision-${decision}`}>{decisionDescriptions[decision]}</p>
          <label htmlFor="credential-reason">Reason shown to the user</label><textarea id="credential-reason" aria-describedby="credential-reason-hint" required minLength={10} maxLength={2000} value={note} disabled={stale} placeholder="Explain what you checked and what the applicant needs to know…" onChange={event => onNote(event.target.value)} /><div className="bw-review-reason-hint" id="credential-reason-hint"><span>10–2,000 characters. Your feedback is visible to the applicant.</span><span>{note.length}/2,000</span></div>
          {decision === "FALSE_CREDENTIAL" && <label className="bw-review-false-confirm"><input type="checkbox" checked={confirmed} disabled={blocked} onChange={event => setConfirmed(event.target.checked)} /><span>I confirm that this finding is supported by the evidence and will remove the credential from profile display.</span></label>}
          <button type="submit" disabled={blocked || note.trim().length < 10 || (decision === "FALSE_CREDENTIAL" && !confirmed)}><ReviewIcon name="check" />{busy ? "Saving decision…" : "Save review decision"}</button>
        </fieldset>
      </form>}
      {review.note && !canDecide && <section className="bw-review-feedback"><h3>Reviewer feedback</h3><p>{review.note}</p></section>}
      {review.hiddenFromPublic && <p className="bw-review-hidden-note"><ReviewIcon name="alert" />This credential is excluded from public display until resolved.</p>}
      <details className="bw-review-history"><summary>Submission & review history <span>{review.attempts?.length || 0} submissions</span></summary><div>{(review.attempts || []).map((attempt, index) => <article key={attempt.id}><header><h4>Submission {index + 1} · Revision {attempt.revision}</h4><ReviewStatus status={attempt.status} /></header><p>{reviewDate(attempt.createdAt)} UTC · {attempt.issuerName || "BrightWay (unlisted issuer)"}</p>{attempt.note && <p>{attempt.note}</p>}{attempt.id !== latest?.id && <Evidence attempt={attempt} allowed={canDownload} disabled={busy} onError={onError} />}</article>)}<h4>Review activity</h4>{!review.events?.length ? <p>No review activity was returned.</p> : <ol>{review.events.map(event => <li key={event.id}><span><ReviewIcon name="check" size={13} /></span><div><strong>{credentialLabels[event.fromStatus] || "Not submitted"} → {credentialLabels[event.toStatus] || event.action}</strong><small>{reviewDate(event.createdAt)} UTC{event.actorId === accountId ? " · Your action" : event.actorId ? " · Reviewer action" : ""}</small>{event.note && <p>{event.note}</p>}</div></li>)}</ol>}</div></details>
    </div>
  </article>;
}
