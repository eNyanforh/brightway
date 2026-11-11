// Author-only, rule-based moderation feedback. Never expose model prompts,
// raw provider responses, safety thresholds, or untrusted classifier prose.
// These notices are derived from persisted checks on every owner read, so an
// interrupted browser session does not hide why a post is awaiting review.
export function postModerationNotice(post) {
  if (!post || post.moderationStatus === "PUBLISHED") return null;
  if (post.moderationStatus === "REJECTED") {
    return {
      code: "MANAGEMENT_DECLINED",
      title: "Not published — Management decision",
      reasons: [post.moderationFeedback?.trim() || "BrightWay Management did not approve this post."],
      nextStep: "Review the feedback and edit your post if you want to resubmit it. Revised posts remain private until Management reviews them.",
    };
  }
  if (post.moderationStatus !== "PENDING") return null;
  const reasons = [];
  const safetyFlag = post.moderationScreenStatus === "FLAGGED" ||
    (Array.isArray(post.moderationFlags) && post.moderationFlags.length > 0);
  const relevance = post.moderationRelevanceStatus;

  if (safetyFlag) reasons.push(
    "The automated safety check flagged a possible posting-guidelines concern. This is not a final decision about your post.",
  );
  if (relevance === "OFF_TOPIC") reasons.push(
    "The relevance check could not identify a clear connection to learning, education, research, skills, professional achievements, careers, or educational events.",
  );
  if (relevance === "UNCERTAIN") reasons.push(
    "The relevance check could not confidently determine how this post supports learning, achievements, or career growth.",
  );
  const unavailable = ["UNAVAILABLE", "NOT_CONFIGURED"].includes(post.moderationScreenStatus) ||
    ["UNAVAILABLE", "NOT_CONFIGURED"].includes(relevance);
  if (unavailable) reasons.push(
    "An automated check was unavailable or incomplete. This does not mean your post violated any rules.",
  );
  if (!reasons.length) reasons.push(
    "This submission requires a BrightWay Management decision before it can appear publicly.",
  );

  let nextStep;
  if (safetyFlag && ["OFF_TOPIC", "UNCERTAIN"].includes(relevance)) {
    nextStep = "Review the wording for potential safety concerns and explain the specific educational or career purpose. You may edit the post, or leave it for Management review.";
  } else if (safetyFlag) {
    nextStep = "Review the wording against BrightWay's posting guidelines. You can edit and resubmit, or leave the post for Management review.";
  } else if (relevance === "OFF_TOPIC") {
    nextStep = "Explain the learning, skills, project, achievement, or career connection and resubmit if appropriate. Management can also review your existing post.";
  } else if (relevance === "UNCERTAIN") {
    nextStep = "Add details about what you learned, achieved, are asking, or how the event supports education or career development. You may edit or await Management review.";
  } else if (unavailable) {
    nextStep = "No action is required. Your post was saved privately for Management review. You can still edit or withdraw it.";
  } else {
    nextStep = "Your post is saved privately and awaiting Management review. You can edit or withdraw it.";
  }

  const code = safetyFlag ? "SAFETY_REVIEW"
    : relevance === "OFF_TOPIC" ? "OFF_TOPIC"
      : relevance === "UNCERTAIN" ? "UNCERTAIN"
        : unavailable ? "SCREENING_UNAVAILABLE" : "MANUAL_REVIEW";
  return { code, title: "Not published yet — review needed", reasons, nextStep };
}
