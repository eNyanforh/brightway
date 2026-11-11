// Author-only notices for posts previously removed or awaiting human review.
// New posts publish immediately; only a prior Management takedown (or legacy
// pending submission) requires an approval before becoming public again.
export function postModerationNotice(post) {
  if (!post || post.moderationStatus === "PUBLISHED") return null;
  if (post.moderationStatus === "REJECTED") {
    return {
      code: "MANAGEMENT_DECLINED",
      title: "Removed by BrightWay Management",
      reasons: [post.moderationFeedback?.trim() || "BrightWay Management removed this post."],
      nextStep: "You may edit your post, but a revised post remains private until Management reviews and approves it.",
    };
  }
  if (post.moderationStatus === "PENDING") return {
    code: "MANUAL_REVIEW",
    title: "Awaiting Management review",
    reasons: ["This post requires a BrightWay Management decision before it can appear publicly."],
    nextStep: "No action is required. You can edit or withdraw the post while waiting for Management review.",
  };
  return null;
}
