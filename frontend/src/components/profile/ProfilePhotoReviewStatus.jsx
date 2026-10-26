import ProfilePicture from "./ProfilePicture";

export default function ProfilePhotoReviewStatus({ review, name, busy, onRefresh, onCancel }) {
  if (review?.required !== true) return null;
  const pending = review.pending;
  return <section className="bw-profile-card bw-profile-photo-review" aria-labelledby="photo-review-heading">
    <h2 id="photo-review-heading">Profile photo review</h2>
    {pending ? <>
      <p>{pending.state === "IN_REVIEW" ? "BrightWay is reviewing your replacement photo." : "Your replacement photo is waiting for BrightWay review."} Your approved photo stays visible until approval.</p>
      <div className="bw-profile-photo-preview"><ProfilePicture id={pending.photoAssetId} name={name} /></div>
      <p>This replacement preview is private to you and your assigned reviewer.</p>
    </> : review.latestDecision?.state === "DECLINED" ? <>
      <p>Your replacement photo was declined. Your approved photo is unchanged.</p>
      <p><strong>Reviewer feedback:</strong> {review.latestDecision.note}</p>
    </> : review.latestDecision?.state === "APPROVED" ? <p>Your replacement photo was approved.</p>
      : <p>Replacement photos need BrightWay approval before they become your current profile photo.</p>}
    <div className="bw-identity-tools">
      {pending && <button type="button" className="bw-profile-text-button" disabled={busy} onClick={onCancel}>Cancel photo request</button>}
      <button type="button" className="bw-profile-text-button" disabled={busy} onClick={onRefresh}>Refresh photo review</button>
    </div>
  </section>;
}
