import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyRelevanceResult, createPostRelevanceScreen, screenPostForPublication,
} from "../src/modules/posts/post-relevance-screen.service.js";

const post = {
  type: "ACHIEVEMENT", body: "I developed a mathematics tutoring app for students.",
  tags: ["Coding"], eventDetails: null,
};
const relevant = {
  verdict: "RELEVANT", confidence: 0.97, category: "ACHIEVEMENT",
  reason: "Documents a student learning project",
};
const providerResponse = content => ({
  ok: true, json: async () => ({
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }],
  }),
});

test("relevance API returns conservative structured educational classification", async () => {
  const captured = [];
  const classify = createPostRelevanceScreen({
    apiKey: "synthetic-test-only",
    request: async (url, options) => {
      captured.push({ url, options });
      return providerResponse(relevant);
    },
  });
  assert.deepEqual(await classify(post), {
    moderationRelevanceStatus: "RELEVANT",
    moderationRelevanceCategory: "ACHIEVEMENT",
    moderationRelevanceReason: relevant.reason,
  });
  assert.equal(captured[0].url, "https://api.openai.com/v1/chat/completions");
  const body = JSON.parse(captured[0].options.body);
  assert.equal(body.model, "gpt-4o-mini");
  assert.equal(body.response_format.type, "json_schema");
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(body.messages[1].content.includes("mathematics tutoring"), true);
  assert.match(body.messages[0].content, /untrusted post content/i);
  assert.equal(captured[0].options.headers.Authorization, "Bearer synthetic-test-only");
  assert.equal(body.messages[1].content.includes("synthetic-test-only"), false);
});

test("only unambiguous relevant content meets the auto-publication classification", () => {
  assert.equal(classifyRelevanceResult(relevant).moderationRelevanceStatus, "RELEVANT");
  assert.equal(classifyRelevanceResult({ ...relevant, confidence: 0.89 }).moderationRelevanceStatus, "UNCERTAIN");
  assert.equal(classifyRelevanceResult({ ...relevant, category: "OTHER" }).moderationRelevanceStatus, "UNCERTAIN");
  assert.equal(classifyRelevanceResult({ ...relevant, verdict: "OFF_TOPIC" }).moderationRelevanceStatus, "OFF_TOPIC");
  assert.equal(classifyRelevanceResult({ ...relevant, verdict: "UNCERTAIN" }).moderationRelevanceStatus, "UNCERTAIN");
  assert.equal(classifyRelevanceResult({ ...relevant, confidence: NaN }).moderationRelevanceStatus, "UNAVAILABLE");
  assert.equal(classifyRelevanceResult({ ...relevant, confidence: 1.2 }).moderationRelevanceStatus, "UNAVAILABLE");
  assert.equal(classifyRelevanceResult(null).moderationRelevanceStatus, "UNAVAILABLE");
});

test("missing credentials, provider errors, refusals and invalid JSON require manual review", async () => {
  const cases = [
    createPostRelevanceScreen({ apiKey: "" }),
    createPostRelevanceScreen({ apiKey: "key", request: async () => { throw Error("unavailable"); } }),
    createPostRelevanceScreen({ apiKey: "key", request: async () => providerResponse({ verdict: "RELEVANT" }) }),
    createPostRelevanceScreen({ apiKey: "key", request: async () => ({
      ok: true, json: async () => ({ choices: [{ finish_reason: "length", message: { content: "{}" } }] }),
    }) }),
    createPostRelevanceScreen({ apiKey: "key", request: async () => ({
      ok: true, json: async () => ({ choices: [{ finish_reason: "stop", message: { refusal: "No" } }] }),
    }) }),
  ];
  for (const classify of cases) {
    const result = await classify(post);
    assert.ok(["NOT_CONFIGURED", "UNAVAILABLE"].includes(result.moderationRelevanceStatus));
  }
});

const safety = result => async () => result;
const relevance = result => async () => result;
const clear = { moderationScreenStatus: "CLEAR", moderationFlags: [] };
const valid = { moderationRelevanceStatus: "RELEVANT", moderationRelevanceCategory: "EDUCATION", moderationRelevanceReason: "Learning goal" };
test("automatic publication requires BOTH real positive safety and relevance results", async () => {
  const good = await screenPostForPublication(post, safety(clear), relevance(valid));
  assert.equal(good.moderationStatus, "PUBLISHED");
  assert.equal(good.moderationRelevanceStatus, "RELEVANT");
  for (const unsafe of [
    { moderationScreenStatus: "FLAGGED", moderationFlags: ["violence"] },
    { moderationScreenStatus: "NOT_CONFIGURED", moderationFlags: [] },
    { moderationScreenStatus: "UNAVAILABLE", moderationFlags: [] },
    { moderationScreenStatus: "CLEAR", moderationFlags: ["harassment"] },
  ]) {
    assert.equal((await screenPostForPublication(post, safety(unsafe), relevance(valid))).moderationStatus, "PENDING");
  }
  for (const relevanceStatus of ["OFF_TOPIC", "UNCERTAIN", "NOT_CONFIGURED", "UNAVAILABLE"]) {
    assert.equal((await screenPostForPublication(post, safety(clear),
      relevance({ ...valid, moderationRelevanceStatus: relevanceStatus }))).moderationStatus, "PENDING");
  }
  assert.equal((await screenPostForPublication(post, safety(clear),
    relevance({ ...valid, moderationRelevanceCategory: "OTHER" }))).moderationStatus, "PENDING");
  assert.equal((await screenPostForPublication(post,
    async () => { throw Error("provider down"); }, relevance(valid))).moderationStatus, "PENDING");
  assert.equal((await screenPostForPublication(post,
    safety(clear), async () => { throw Error("provider down"); })).moderationStatus, "PENDING");
});
