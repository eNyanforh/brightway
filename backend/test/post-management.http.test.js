import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createOrganizationPostRoutes } from "../src/modules/posts/organization-posts.routes.js";

const accountId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const postId = "33333333-3333-4333-8333-333333333333";
const organizationId = "44444444-4444-4444-8444-444444444444";
const origin = "http://localhost:5173";

test("edit endpoints require authentication, trusted Origin and server-side publisher calls", async () => {
  const calls = [];
  const sessions = {
    async authenticate(token) {
      if (token !== "valid-personal-session")
        throw Object.assign(new Error("Sign in first."), { status: 401 });
      return { account: { id: accountId }, sessionId };
    },
  };
  const posts = {
    async memberEdit(actor, id, input) {
      calls.push(["member", actor, id, input]);
      return { post: { id, body: input.body, tags: input.tags, member: { username: "owner" } } };
    },
    async edit(actor, org, id, input) {
      calls.push(["organization", actor, org, id, input]);
      return { post: { id, body: input.body, organization: { id: org } } };
    },
    async memberWithdraw(actor, id) {
      calls.push(["delete-member", actor, id]);
      return { id };
    },
    async withdraw(actor, org, id) {
      calls.push(["delete-organization", actor, org, id]);
      return { id };
    },
  };
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createOrganizationPostRoutes({
    posts, sessions, photos: {}, nodeEnv: "test", clientUrl: origin,
  }));
  app.use((error, _req, res, _next) => res.status(error.status ?? 500)
    .json({ success: false, message: error.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port + "/api/v1";
  const headers = {
    Cookie: "brightway_session=valid-personal-session",
    Origin: origin, "Content-Type": "application/json",
  };
  const payload = {
    expectedBody: "Old post", expectedTags: ["Coding"],
    body: "Updated post", tags: ["Coding"],
  };
  try {
    const memberPath = base + "/posts/me/" + postId;
    assert.equal((await fetch(memberPath, { method: "PATCH", headers: { Origin: origin,
      "Content-Type": "application/json" }, body: JSON.stringify(payload) })).status, 401);
    assert.equal((await fetch(memberPath, { method: "PATCH",
      headers: { ...headers, Origin: "https://bad-origin.invalid" },
      body: JSON.stringify(payload) })).status, 403);
    assert.equal(calls.length, 0, "untrusted requests never reach post service");

    const member = await fetch(memberPath, { method: "PATCH", headers, body: JSON.stringify(payload) });
    assert.equal(member.status, 200);
    assert.equal(member.headers.get("cache-control"), "no-store");
    assert.equal((await member.json()).data.post.body, "Updated post");
    assert.deepEqual(calls[0], ["member", { accountId, sessionId }, postId, payload]);

    const orgPayload = { expectedBody: "Original", body: "Revised organization update" };
    const orgPath = base + "/organization-workspace/" + organizationId + "/posts/" + postId;
    const organization = await fetch(orgPath, {
      method: "PATCH", headers, body: JSON.stringify(orgPayload),
    });
    assert.equal(organization.status, 200);
    assert.equal((await organization.json()).data.post.body, orgPayload.body);
    assert.deepEqual(calls[1], ["organization", { accountId, sessionId }, organizationId, postId, orgPayload]);

    const removed = await fetch(memberPath, { method: "DELETE", headers, body: "{}" });
    assert.equal(removed.status, 200);
    const removedOrg = await fetch(orgPath, { method: "DELETE", headers, body: "{}" });
    assert.equal(removedOrg.status, 200);
    assert.equal(calls.length, 4);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
