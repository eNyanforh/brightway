// Moderation feedback is authored by the backend using stable policy rules.
// Do not present raw safety categories or untrusted classifier text here.
export default function PostModerationNotice({ notice }) {
  if (!notice) return null;
  const reasons = Array.isArray(notice.reasons)
    ? notice.reasons.filter(value => typeof value === "string" && value.trim())
    : [];
  return (
    <div className="bw-post-moderation-notice" data-reason={notice.code || "MANUAL_REVIEW"}>
      <strong className="bw-post-moderation-title">{notice.title || "Review required"}</strong>
      {reasons.length === 1
        ? <p>{reasons[0]}</p>
        : reasons.length > 1
          ? <ul>{reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>
          : null}
      {notice.nextStep && <p className="bw-post-moderation-next"><strong>What you can do:</strong> {notice.nextStep}</p>}
    </div>
  );
}
