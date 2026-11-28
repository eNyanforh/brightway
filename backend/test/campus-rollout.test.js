import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { createCampusRollout } from "../src/modules/campus/campus-rollout.js";
import { createCampusPreviewRoutes } from "../src/modules/campus/campus-preview.routes.js";
import { createCampusRoutes } from "../src/modules/campus/campus.routes.js";

const org = randomUUID(), other = randomUUID();
const preview = { NODE_ENV: "test", VIRTUAL_CAMPUS_PREVIEW_ENABLED: "true", VIRTUAL_CAMPUS_PREVIEW_ORGANIZATION_IDS: org };
const path = `/organization-workspace/${org}/campus`;

test("preview requires explicit opt-in, valid organization allowlist and a non-production environment", () => {
  for (const config of [
    {}, { ...preview, NODE_ENV: undefined }, { ...preview, NODE_ENV: "production" },
    { ...preview, VIRTUAL_CAMPUS_PREVIEW_ENABLED: "false" },
    { ...preview, VIRTUAL_CAMPUS_PREVIEW_ENABLED: true },
    { ...preview, VIRTUAL_CAMPUS_PREVIEW_ENABLED: "TRUE" },
    { ...preview, VIRTUAL_CAMPUS_PREVIEW_ORGANIZATION_IDS: "" },
    { ...preview, VIRTUAL_CAMPUS_PREVIEW_ORGANIZATION_IDS: "*" },
    { ...preview, VIRTUAL_CAMPUS_PREVIEW_ORGANIZATION_IDS: `${org},invalid` },
  ]) assert.equal(createCampusRollout(config).allows(org), false);
  for (const NODE_ENV of ["development", "test"]) {
    const rollout = createCampusRollout({ ...preview, NODE_ENV });
    assert.equal(rollout.allows(org), true);
    assert.equal(rollout.allows(other), false);
  }
  assert.equal(createCampusRollout({ ...preview, VIRTUAL_CAMPUS_PREVIEW_ORGANIZATION_IDS: ` ${org}, ${other},${org} ` }).allows(other), true);
});

async function serve(t, router) {
  const app = express(); app.use(express.json()); app.use(router);
  app.use((req, res) => res.status(404).json({ success: false }));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ message: error.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test("mounted preview denies disabled and production requests before any session or database access", async t => {
  const forbidden = new Proxy({}, { get() { assert.fail("Disabled preview must not access sessions or database"); } });
  for (const config of [{ NODE_ENV: "test" }, { ...preview, NODE_ENV: "production" }]) {
    const base = await serve(t, createCampusPreviewRoutes({ prisma: forbidden, sessions: forbidden,
      clientUrl: "http://localhost:5173", nodeEnv: config.NODE_ENV, config }));
    for (const [method, suffix] of [["GET", ""], ["PUT", "/setup"], ["POST", "/activate"], ["POST", "/pause"], ["POST", "/resume"], ["PATCH", "/settings"], ["GET", "/announcements"], ["POST", "/grade-school/subjects"], ["POST", "/engines"], ["PATCH", "/engines/TVET/configuration"], ["GET", "/permissions"], ["PUT", "/permissions/" + randomUUID()], ["GET", "/history"], ["GET", "/onboarding"], ["PUT", "/onboarding"], ["POST", "/onboarding/complete"]]) {
      const response = await fetch(base + path + suffix, { method });
      assert.equal(response.status, 404);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
  }
});

test("enabled preview keeps management billing and non-allowlisted organizations unavailable", async t => {
  const forbidden = new Proxy({}, { get() { assert.fail("Dormant routes must not access sessions or database"); } });
  const base = await serve(t, createCampusPreviewRoutes({ prisma: forbidden, sessions: forbidden,
    clientUrl: "http://localhost:5173", nodeEnv: "test", config: preview }));
  for (const url of ["/my-tvet", "/management/billing", `/organization-workspace/${other}/campus`]) {
    assert.equal((await fetch(base + url)).status, 404, url);
  }
});

test("preview allowlist never replaces authentication, trusted Origin or service authorization", async t => {
  const actor = { account: { id: randomUUID() }, sessionId: randomUUID() };
  const sessions = { authenticate: async token => {
    if (token !== "valid") throw Object.assign(Error("Sign in"), { status: 401 });
    return actor;
  } };
  let calls = 0;
  const campus = {
    availability: async (who, id) => { calls++; assert.equal(who.accountId, actor.account.id); assert.equal(id, org); return { organizationId: org }; },
    setup: async () => { calls++; throw Object.assign(Error("Not the primary administrator"), { status: 403 }); },
  };
  const base = await serve(t, createCampusRoutes({ campus, sessions, clientUrl: "http://localhost:5173", nodeEnv: "test",
    isEnabledFor: createCampusRollout(preview).allows, lifecycleOnly: true }));
  assert.equal((await fetch(base + path)).status, 401);
  const cookie = "brightway_session=valid";
  assert.equal((await fetch(base + path, { headers: { cookie } })).status, 200);
  for (const Origin of [undefined, "https://attacker.invalid"]) {
    assert.equal((await fetch(base + path + "/setup", { method: "PUT", headers: { cookie, ...(Origin ? { Origin } : {}) } })).status, 403);
  }
  assert.equal(calls, 1);
  assert.equal((await fetch(base + path + "/setup", { method: "PUT", headers: { cookie, Origin: "http://localhost:5173" } })).status, 403);
  assert.equal(calls, 2);
});

 test("enabled academic and learner preview routes still require authentication", async t => {
  const sessions = { authenticate: async () => { throw Object.assign(Error("Sign in"), { status: 401 }); } };
  const base = await serve(t, createCampusPreviewRoutes({ prisma: {}, sessions, clientUrl: "http://localhost:5173", nodeEnv: "test", config: preview }));
  for (const suffix of ["/workspace/overview", "/grade-school", "/tvet", "/billing", "/announcements", "/permission-members"]) assert.equal((await fetch(base + path + suffix)).status, 401);
  for (const suffix of ["/my-campus", "/my-campus/guardians", "/my-campus/registrations/" + randomUUID()]) assert.equal((await fetch(base + suffix)).status, 401);
 });
