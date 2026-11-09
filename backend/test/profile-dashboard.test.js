import assert from "node:assert/strict";
import test from "node:test";
import { createProfileDashboardService } from "../src/modules/profile/profile-dashboard.service.js";

const owner = "11111111-1111-4111-8111-111111111111";
const session = "22222222-2222-4222-8222-222222222222";
const at = new Date("2026-11-09T19:30:00.000Z");

test("dashboard returns only the signed-in owner's seven-day aggregate totals", async () => {
  const calls = [];
  let sessionChecks = 0;
  const prisma = {
    $queryRaw: async () => { sessionChecks++; return [{ id: session }]; },
    profileVisit: { count: async ({ where }) => { calls.push(["profile", where]); return 9; } },
    postView: { count: async ({ where }) => { calls.push(["posts", where]); return 3; } },
    profileSearchAppearance: { count: async ({ where }) => { calls.push(["search", where]); return 6; } },
  };
  const stats = await createProfileDashboardService({ prisma, now: () => at }).read({
    accountId: owner, sessionId: session,
  });
  assert.deepEqual(stats, {
    periodDays: 7,
    measuredSince: "2026-11-02T19:30:00.000Z",
    profileViews: 9,
    postImpressions: 3,
    searchAppearances: 6,
  });
  assert.equal(sessionChecks, 2, "session checked before and after data reads");
  const byKind = Object.fromEntries(calls);
  assert.equal(byKind.profile.ownerId, owner);
  assert.equal(byKind.search.ownerId, owner);
  assert.equal(byKind.profile.createdAt.gte.toISOString(), stats.measuredSince);
  assert.equal(byKind.search.createdAt.gte.toISOString(), stats.measuredSince);
  assert.equal(byKind.posts.memberPost.authorId, owner);
  assert.equal(byKind.posts.memberPost.withdrawnAt, null);
  assert.deepEqual(byKind.posts.accountId, { not: owner });
  assert.equal(byKind.posts.createdAt.gte.toISOString(), stats.measuredSince);
  assert.deepEqual(Object.keys(stats).sort(), [
    "measuredSince", "periodDays", "postImpressions", "profileViews", "searchAppearances",
  ]);
});

test("dashboard rejects invalid and revoked sessions without exposing metrics", async () => {
  let countCalled = false;
  const prisma = {
    $queryRaw: async () => [],
    profileVisit: { count: async () => { countCalled = true; return 3; } },
    postView: { count: async () => { countCalled = true; return 3; } },
    profileSearchAppearance: { count: async () => { countCalled = true; return 3; } },
  };
  const dashboard = createProfileDashboardService({ prisma, now: () => at });
  await assert.rejects(dashboard.read({ accountId: owner, sessionId: session }), { status: 401 });
  await assert.rejects(dashboard.read({ accountId: owner, sessionId: "not-a-session" }), { status: 401 });
  assert.equal(countCalled, false);
});
