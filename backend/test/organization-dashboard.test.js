import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { organizationFixture } from "../test-support/organization-fixture.js";
import { createOrganizationStaffService } from "../src/modules/organizations/organization-staff.service.js";
import { createOrganizationStaffRoutes } from "../src/modules/organizations/organization-staff.routes.js";
import { dashboardPeriod } from "../src/modules/organizations/organization-dashboard.js";

async function fixture() {
  const f = organizationFixture(), approved = await f.decide(await f.report(await f.assign(await f.submit())));
  const actor = f.actors.owner, id = approved.organizationId, queries = [];
  f.state.mfaFactor.push({ accountId: actor.id, enabled: true, version: 1 });
  Object.assign(f.state.session.find(s => s.id === actor.sessionId), { mfaVersion: 1, mfaVerifiedAt: f.now() });
  f.db.$queryRaw = async (strings, ...values) => {
    const sql = strings.join("?"); queries.push({ sql, values });
    if (sql.includes('FROM "OrganizationMembership"')) return [{ enabledMembers: 3, pendingInvitations: 2, expiringInvitations: 1 }];
    return [{ current: { SUBMITTED: 4, IN_REVIEW: 2 }, newClaims: 5, completedClaims: 3, outcomes: { VERIFIED: 2, UNABLE_TO_VERIFY: 1 }, trend: [{ bucket: 0, submissions: 5, decisions: 3 }], unassigned: 4, pastTarget: 2, medianHours: 27.25 }];
  };
  const staff = createOrganizationStaffService({ prisma: f.db, now: f.now });
  return { ...f, id, actor, staff, queries, read: supplied => staff.dashboard(actor.id, actor.sessionId, id, supplied) };
}
test("dashboard exposes only scoped aggregates and zero-fills bounded UTC time buckets", async () => {
  const f = await fixture(), data = await f.read({ days: "90" });
  assert.equal(data.organizationId, f.id); assert.equal(data.team.data.enabledMembers, 3);
  assert.equal(data.reviews.data.completedClaims, 3); assert.equal(data.reviews.data.medianHours, 27.3);
  assert.equal(data.reviews.data.trend.length, 13); assert.equal(data.reviews.data.trend[1].submissions, 0);
  assert.equal(data.reviews.data.current.ACTION_REQUIRED, 0); assert.equal(data.reviews.data.outcomes.FALSE_CREDENTIAL, 0);
  assert.deepEqual(data.reviews.kinds, ["education", "experience"]); assert.equal(f.queries.length, 2);
  const reviewQuery = f.queries[1]; assert(reviewQuery.values.includes(f.id));
  assert(reviewQuery.values.includes(f.state.account.find(a => a.id === f.actor.id).personId));
  assert.equal(JSON.stringify(data).includes("passwordHash"), false); assert.equal(JSON.stringify(data).includes("snapshot"), false);
  assert.equal(dashboardPeriod(7, new Date("2026-11-01T00:00:00Z")).from, "2026-10-26T00:00:00.000Z");
});
test("dashboard education reviewers cannot receive team counts or experience aggregates", async () => {
  const f = await fixture(), member = f.state.organizationMembership[0];
  Object.assign(member, { role: "STAFF", permissions: ["organization.credentials.education.review"] });
  const data = await f.read(); assert.deepEqual(data.team, { access: "permission_required" });
  assert.deepEqual(data.reviews.kinds, ["education"]); assert.equal(f.queries.length, 1);
  assert(f.queries[0].values.includes(true)); assert(f.queries[0].values.includes(false));
  member.permissions = [];
  const denied = await f.read(); assert.deepEqual(denied.reviews, { access: "permission_required" });
  assert.equal(f.queries.length, 1);
});
test("missing MFA or verified email redacts counts without making ordinary MFA mandatory", async () => {
  const f = await fixture();
  f.state.mfaFactor.find(m => m.accountId === f.actor.id).enabled = false;
  let data = await f.read(); assert.deepEqual(data.team, { access: "mfa_required" }); assert.deepEqual(data.reviews, { access: "mfa_required" });
  assert.equal(f.queries.length, 0);
  f.state.account.find(a => a.id === f.actor.id).emailVerifiedAt = null;
  data = await f.read(); assert.deepEqual(data.reviews, { access: "email_required" }); assert.equal(f.queries.length, 0);
});
test("foreign/disabled membership, suspended organizations, stale MFA and forged period/scope are rejected", async () => {
  const f = await fixture();
  await assert.rejects(f.staff.dashboard(f.actors.other.id, f.actors.other.sessionId, f.id), { status: 403 });
  for (const body of [{ days: "365" }, { days: ["7", "30"] }, { days: "7", organizationId: f.id }, { kinds: ["education"] }, { public: true }]) await assert.rejects(f.read(body), { status: 400 });
  f.state.mfaFactor.find(m => m.accountId === f.actor.id).version++;
  await assert.rejects(f.read(), { status: 403 });
  f.state.mfaFactor.find(m => m.accountId === f.actor.id).version--;
  f.state.organization[0].status = "SUSPENDED"; await assert.rejects(f.read(), { status: 404 });
  assert.equal(f.queries.length, 0);
});
test("aggregation failures never become zeros and final membership/session revocation discards results", async () => {
  const f = await fixture(), original = f.db.$queryRaw;
  f.db.$queryRaw = async () => { throw Error("Injected aggregate failure"); };
  await assert.rejects(f.read(), /Injected aggregate failure/);
  f.db.$queryRaw = async (...args) => { const row = await original(...args); f.state.organizationMembership[0].permissions = []; f.state.organizationMembership[0].role = "STAFF"; return row; };
  await assert.rejects(f.read(), { status: 403 });
  Object.assign(f.state.organizationMembership[0], { role: "PRIMARY_ADMIN", permissions: [] });
  f.db.$queryRaw = async (...args) => { const row = await original(...args); f.state.session.find(s => s.id === f.actor.sessionId).expiresAt = new Date(0); return row; };
  await assert.rejects(f.read(), { status: 403 });
});
test("dashboard HTTP is authenticated, uncached, strict and masks unexpected database failures", async () => {
  const f = await fixture(), app = express();
  app.use(createOrganizationStaffRoutes({ staff: f.staff, nodeEnv: "test", clientUrl: "http://localhost:5173", limiter: (_req, _res, next) => next(), sessions: { async authenticate(token) { if (token !== "fixture") throw Object.assign(Error("Sign in"), { status: 401 }); return { account: { id: f.actor.id }, sessionId: f.actor.sessionId }; } } }));
  app.use((e, _req, res, _next) => res.status(e.status || 500).json({ success: false, message: e.message }));
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  const path = `http://127.0.0.1:${server.address().port}/organization-workspace/${f.id}/dashboard`, headers = { Cookie: "brightway_session=fixture" };
  try {
    assert.equal((await fetch(path)).status, 401);
    const response = await fetch(path + "?days=7", { headers }); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.json()).data.period.days, 7);
    assert.equal((await fetch(path + "?days=7&permissions=all", { headers })).status, 400);
    f.db.$queryRaw = async () => { throw Error("private database connection details"); };
    const failed = await fetch(path, { headers }); assert.equal(failed.status, 503); assert.equal((await failed.text()).includes("private database"), false);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
