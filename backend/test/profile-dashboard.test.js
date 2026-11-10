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
    profileVisit: {
      count: async ({ where }) => { calls.push(["profile", where]); return 9; },
      findMany: async options => {
        calls.push(["viewers", options]);
        return [{
          viewer: {
            username: "visible_viewer",
            person: { firstName: "Visible", middleName: null, lastName: "Viewer",
              profile: { photoId: "55555555-5555-4555-8555-555555555555" } },
          },
        }];
      },
    },
    postView: { count: async ({ where }) => { calls.push(["posts", where]); return 3; } },
    profileSearchAppearance: {
      count: async ({ where }) => { calls.push(["search", where]); return 6; },
      findMany: async options => {
        calls.push(["searchers", options]);
        return [{ viewer: {
          username: "student_searcher",
          person: { firstName: "Student", middleName: null, lastName: "Searcher", profile: null },
        } }];
      },
    },
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
    recentProfileViewers: [{
      username: "visible_viewer", name: "Visible Viewer",
      photoId: "55555555-5555-4555-8555-555555555555",
    }],
    recentSearchers: [{ username: "student_searcher", name: "Student Searcher", photoId: null }],
  });
  assert.equal(sessionChecks, 2, "session checked before and after data reads");
  const byKind = Object.fromEntries(calls);
  assert.equal(byKind.profile.ownerId, owner);
  assert.equal(byKind.search.ownerId, owner);
  assert.equal(byKind.viewers.where.ownerId, owner);
  assert.equal(byKind.viewers.where.viewer.status, "ACTIVE");
  assert.equal(byKind.viewers.where.viewer.networkLeft.none.rightAccountId, owner);
  assert.deepEqual(byKind.viewers.where.viewer, byKind.searchers.where.viewer);
  assert.equal(byKind.searchers.where.ownerId, owner);
  assert.equal(byKind.viewers.where.viewer.networkRight.none.leftAccountId, owner);
  assert.deepEqual(byKind.viewers.distinct, ["viewerId"]);
  assert.equal(byKind.viewers.take, 3);
  assert.deepEqual(byKind.viewers.select.viewer.select.person.select.profile.select, { photoId: true });
  assert.equal(byKind.viewers.where.createdAt.gte.toISOString(), stats.measuredSince);
  assert.equal(byKind.profile.createdAt.gte.toISOString(), stats.measuredSince);
  assert.equal(byKind.search.createdAt.gte.toISOString(), stats.measuredSince);
  assert.equal(byKind.posts.memberPost.authorId, owner);
  assert.equal(byKind.posts.memberPost.withdrawnAt, null);
  assert.deepEqual(byKind.posts.accountId, { not: owner });
  assert.equal(byKind.posts.createdAt.gte.toISOString(), stats.measuredSince);
  assert.deepEqual(Object.keys(stats).sort(), [
    "measuredSince", "periodDays", "postImpressions", "profileViews",
    "recentProfileViewers", "recentSearchers", "searchAppearances",
  ]);
});

test("dashboard rejects invalid and revoked sessions without exposing metrics", async () => {
  let countCalled = false;
  const prisma = {
    $queryRaw: async () => [],
    profileVisit: {
      count: async () => { countCalled = true; return 3; },
      findMany: async () => { countCalled = true; return []; },
    },
    postView: { count: async () => { countCalled = true; return 3; } },
    profileSearchAppearance: { count: async () => { countCalled = true; return 3; }, findMany: async () => { countCalled = true; return []; } },
  };
  const dashboard = createProfileDashboardService({ prisma, now: () => at });
  await assert.rejects(dashboard.read({ accountId: owner, sessionId: session }), { status: 401 });
  await assert.rejects(dashboard.read({ accountId: owner, sessionId: "not-a-session" }), { status: 401 });
  assert.equal(countCalled, false);
});

test("dashboard returns no identities when there are no eligible active members", async () => {
  const prisma = {
    $queryRaw: async () => [{ id: session }],
    profileVisit: { count: async () => 8, findMany: async () => [] },
    postView: { count: async () => 1 },
    profileSearchAppearance: { count: async () => 12, findMany: async () => [] },
  };
  const stats = await createProfileDashboardService({ prisma, now: () => at })
    .read({ accountId: owner, sessionId: session });
  assert.equal(stats.profileViews, 8);
  assert.equal(stats.searchAppearances, 12);
  assert.deepEqual(stats.recentProfileViewers, []);
  assert.deepEqual(stats.recentSearchers, []);
  assert.equal(JSON.stringify(stats).includes("viewerId"), false);
});
