import assert from "node:assert/strict";
import test from "node:test";
import { postModerationNotice } from "../src/modules/posts/post-moderation-notice.js";

const held = extra => ({ moderationStatus: "PENDING", moderationScreenStatus: "CLEAR",
  moderationFlags: [], moderationRelevanceStatus: "RELEVANT", ...extra });

test("safety flags produce immediate actionable guidance without asserting guilt", () => {
  const notice = postModerationNotice(held({ moderationScreenStatus: "FLAGGED", moderationFlags: ["harassment"] }));
  assert.equal(notice.code, "SAFETY_REVIEW");
  assert.match(notice.reasons[0], /possible posting-guidelines concern/i);
  assert.match(notice.reasons[0], /not a final decision/i);
  assert.match(notice.nextStep, /review the wording/i);
  assert.doesNotMatch(JSON.stringify(notice), /harassment|classifier threshold|provider|api key/i);
});

test("off-topic posts explain BrightWay's purpose and how to revise", () => {
  const notice = postModerationNotice(held({ moderationRelevanceStatus: "OFF_TOPIC" }));
  assert.equal(notice.code, "OFF_TOPIC");
  assert.match(notice.reasons[0], /learning, education, research, skills/);
  assert.match(notice.nextStep, /learning, skills, project, achievement, or career connection/i);
  assert.match(notice.nextStep, /Management/i);
});

test("uncertain posts explain uncertainty, not an automatic rejection", () => {
  const notice = postModerationNotice(held({ moderationRelevanceStatus: "UNCERTAIN" }));
  assert.equal(notice.code, "UNCERTAIN");
  assert.match(notice.reasons[0], /could not confidently determine/i);
  assert.match(notice.nextStep, /learned, achieved/);
  assert.doesNotMatch(JSON.stringify(notice), /rejected/i);
});

test("combined safety and relevance concerns explain both", () => {
  const notice = postModerationNotice(held({
    moderationScreenStatus: "FLAGGED", moderationFlags: ["violence"],
    moderationRelevanceStatus: "OFF_TOPIC",
  }));
  assert.equal(notice.code, "SAFETY_REVIEW");
  assert.equal(notice.reasons.length, 2);
  assert.match(notice.nextStep, /safety concerns/);
  assert.match(notice.nextStep, /educational or career purpose/);
});

test("screening errors give service explanation and no-blame next step", () => {
  for (const status of ["UNAVAILABLE", "NOT_CONFIGURED"]) {
    const notice = postModerationNotice(held({ moderationScreenStatus: status }));
    assert.equal(notice.code, "SCREENING_UNAVAILABLE");
    assert.match(notice.reasons[0], /does not mean your post violated/i);
    assert.match(notice.nextStep, /No action is required/i);
  }
  const notice = postModerationNotice(held({ moderationRelevanceStatus: "UNAVAILABLE" }));
  assert.equal(notice.code, "SCREENING_UNAVAILABLE");
});

test("reviewer holds and prior declines never silently leave user without an explanation", () => {
  const review = postModerationNotice(held());
  assert.equal(review.code, "MANUAL_REVIEW");
  assert.match(review.reasons[0], /requires a BrightWay Management decision/);

  const declined = postModerationNotice({ moderationStatus: "REJECTED",
    moderationFeedback: "Please remove the unsupported claim." });
  assert.equal(declined.code, "MANAGEMENT_DECLINED");
  assert.deepEqual(declined.reasons, ["Please remove the unsupported claim."]);
  assert.match(declined.nextStep, /Revised posts remain private/);
  const oldDeclined = postModerationNotice({ moderationStatus: "REJECTED" });
  assert.match(oldDeclined.reasons[0], /did not approve/i);
  assert.equal(postModerationNotice({ moderationStatus: "PUBLISHED" }), null);
  assert.equal(postModerationNotice(null), null);
});
