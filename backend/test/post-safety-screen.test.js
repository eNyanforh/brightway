import assert from "node:assert/strict";
import test from "node:test";
import { createPostSafetyScreen, moderationText } from "../src/modules/posts/post-safety-screen.service.js";

const event = {
  type: "EVENT",
  body: "Celebrate scholarship winners at our research conference.",
  tags: ["Education", "Research"],
  eventDetails: {
    title: "University research day",
    venue: "Campus hall",
    meetingUrl: "https://private.example.invalid/secret-attendee-token",
  },
};

test("safety text includes posts and metadata but excludes restricted event meeting links", () => {
  const text = moderationText(event);
  assert.match(text, /University research day/);
  assert.match(text, /Education/);
  assert.doesNotMatch(text, /secret-attendee-token/);
  assert.match(moderationText({ body: "Please help", tags: ["Programming"], questionDetails: { title: "How do I write JavaScript?" } }), /JavaScript/);
});

test("missing API credentials fail closed into manual review without a provider call", async () => {
  let called = false;
  const screen = createPostSafetyScreen({ apiKey: "", request: async () => { called = true; } });
  assert.deepEqual(await screen(event), { moderationScreenStatus: "NOT_CONFIGURED", moderationFlags: [] });
  assert.equal(called, false);
});

test("clean and flagged provider responses remain signals, not publication authority", async () => {
  const requests = [];
  const screen = createPostSafetyScreen({ apiKey: "synthetic-key", request: async (url, init) => {
    requests.push({ url, init });
    return { ok: true, json: async () => ({ results: [{ flagged: true, categories: { harassment: true, "violence/graphic": true, sexual: false } }] }) };
  } });
  assert.deepEqual(await screen(event), { moderationScreenStatus: "FLAGGED", moderationFlags: ["harassment", "violence/graphic"] });
  assert.equal(requests[0].url, "https://api.openai.com/v1/moderations");
  assert.equal(JSON.parse(requests[0].init.body).model, "omni-moderation-latest");
  assert.doesNotMatch(requests[0].init.body, /secret-attendee-token/);

  const safe = createPostSafetyScreen({ apiKey: "synthetic-key", request: async () => ({
    ok: true, json: async () => ({ results: [{ flagged: false, categories: {} }] }),
  }) });
  assert.deepEqual(await safe(event), { moderationScreenStatus: "CLEAR", moderationFlags: [] });
});

test("provider failures and malformed responses fail closed without leaking content or exceptions", async () => {
  const fail = createPostSafetyScreen({ apiKey: "synthetic-key", request: async () => { throw Error("provider secret"); } });
  const invalid = createPostSafetyScreen({ apiKey: "synthetic-key", request: async () => ({ ok: true, json: async () => ({ results: [] }) }) });
  const error = createPostSafetyScreen({ apiKey: "synthetic-key", request: async () => ({ ok: false, status: 429 }) });
  for (const screen of [fail, invalid, error]) {
    assert.deepEqual(await screen(event), { moderationScreenStatus: "UNAVAILABLE", moderationFlags: [] });
  }
});
