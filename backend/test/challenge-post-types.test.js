import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createInput, validateAnswers } from "../src/modules/opportunities/opportunity.schema.js";
import { countChallengeWords, memberPostIdFromInput, newChallengePostType,
  describeChallengePostType } from "../../shared/challenge-submissions.mjs";

const formats = () => ["VIDEO_POST", "CAPTION", "PHOTO_POST", "DOCUMENT_POST"]
  .map(type => newChallengePostType(type, randomUUID()));
const listing = postRequirements => ({
  type: "CHALLENGE", title: "Build and explain your research innovation",
  description: "Create an original learning resource and publish your work on BrightWay.",
  location: "BrightWay", workMode: "REMOTE", deadline: "2099-12-01T12:00:00Z",
  questions: [], requestKey: randomUUID(), postRequirements,
});

test("all four post types have specialized validated settings and can be combined", () => {
  const selected = formats();
  const parsed = createInput.parse(listing(selected));
  assert.deepEqual(parsed.postRequirements, selected);
  assert.equal(selected[0].minDurationSeconds, 15);
  assert.equal(selected[0].maxDurationSeconds, 120);
  assert.equal(selected[1].minWords, 25);
  assert.equal(selected[1].maxWords, 200);
  assert.equal(selected[2].maxImages, 4);
  assert.equal(selected[3].maxPages, 30);
  for (const rule of selected) assert(describeChallengePostType(rule).length > 10);
  assert.deepEqual(createInput.parse(listing([])).postRequirements, []);
});

test("post settings reject duplicate types, malformed ranges and wrong fields", () => {
  const [video, caption, photo, pdf] = formats();
  const invalid = [
    [{ ...video, maxDurationSeconds: 0 }],
    [{ ...video, minDurationSeconds: 500, maxDurationSeconds: 20 }],
    [{ ...video, minDurationSeconds: 1.2 }],
    [{ ...caption, maxWords: 0 }],
    [{ ...caption, minWords: 100, maxWords: 30 }],
    [{ ...photo, minImages: 3, maxImages: 2 }],
    [{ ...photo, maxImages: 5 }],
    [{ ...pdf, maxPages: 101 }],
    [video, { ...video, id: randomUUID() }],
    [video, { ...caption, id: video.id }],
    [video, caption, photo, pdf, { ...pdf, id: randomUUID() }],
    [{ type: "VIDEO_POST", id: video.id, duration: 30 }],
    [{ ...caption, maxWords: 250, redirectUrl: "https://external.invalid" }],
  ];
  for (const postRequirements of invalid)
    assert.equal(createInput.safeParse(listing(postRequirements)).success, false, JSON.stringify(postRequirements));
  assert.equal(createInput.safeParse({ ...listing(formats()), maxApplicants: 25 }).success, false);
});

test("caption word constraints apply to submission; native post IDs are required", () => {
  const [video, caption] = formats();
  const postId = randomUUID();
  const answers = { [video.id]: postId, [caption.id]: "This is a proper five word caption" };
  const reqs = [video, { ...caption, minWords: 3, maxWords: 8 }];
  assert.equal(countChallengeWords(answers[caption.id]), 7);
  assert.doesNotThrow(() => validateAnswers([], answers, [], true, reqs));
  assert.throws(() => validateAnswers([], { [caption.id]: "Too short" }, [], true, reqs),
    { status: 400 }, "required video post must be supplied");
  assert.throws(() => validateAnswers([], { [video.id]: postId, [caption.id]: "short" }, [], true, reqs),
    { status: 400 }, "minimum word count enforced");
  assert.throws(() => validateAnswers([], { [video.id]: postId, [caption.id]: "one two three four five six seven eight nine" }, [], true, reqs),
    { status: 400 }, "maximum word count enforced");
  assert.throws(() => validateAnswers([], { [video.id]: "https://external.invalid/post", [caption.id]: answers[caption.id] }, [], true, reqs),
    { status: 400 }, "external links rejected by backend");
  assert.doesNotThrow(() => validateAnswers([], {}, [], false, reqs), "incomplete draft can be saved");
  assert.equal(memberPostIdFromInput("https://brightway.me/explore/posts/member/" + postId), postId);
  assert.equal(memberPostIdFromInput(postId), postId);
  assert.equal(memberPostIdFromInput("https://not-brightway.invalid"), "");
});
