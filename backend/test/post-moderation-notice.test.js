import assert from "node:assert/strict";
import test from "node:test";
import { postModerationNotice } from "../src/modules/posts/post-moderation-notice.js";

test("newly published posts have no moderation hold notice", () => {
  assert.equal(postModerationNotice({ moderationStatus: "PUBLISHED" }), null);
  assert.equal(postModerationNotice(null), null);
});

test("old pending or revised removed posts get a neutral human review notice", () => {
  const notice = postModerationNotice({ moderationStatus: "PENDING" });
  assert.equal(notice.code, "MANUAL_REVIEW");
  assert.match(notice.reasons[0], /Management decision/i);
  assert.match(notice.nextStep, /edit or withdraw/i);
  // Historic AI assessment columns do not affect current decisions or messages.
  assert.deepEqual(postModerationNotice({ moderationStatus: "PENDING", moderationScreenStatus: "FLAGGED", moderationRelevanceStatus: "OFF_TOPIC" }), notice);
});

test("Management removals retain human feedback, and revisions require approval", () => {
  const notice = postModerationNotice({ moderationStatus: "REJECTED", moderationFeedback: "Please correct the inaccurate claim." });
  assert.equal(notice.code, "MANAGEMENT_DECLINED");
  assert.deepEqual(notice.reasons, ["Please correct the inaccurate claim."]);
  assert.match(notice.nextStep, /revised post remains private/i);
  assert.match(postModerationNotice({ moderationStatus: "REJECTED" }).reasons[0], /Management removed/i);
});
