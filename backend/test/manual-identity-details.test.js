import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { randomUUID } from "node:crypto";
import { manualReviewFixture } from "../test-support/manual-identity-review-fixture.js";
import { createManualIdentityDetailsService } from "../src/modules/manual-identity/manual-identity-details.service.js";
import { createManualIdentityReviewRoutes } from "../src/modules/manual-identity/manual-identity-review.routes.js";
function fixture(verify) {
  const f = manualReviewFixture(), sessionId = randomUUID();
  f.state.account[0].passwordHash = "stored-hash"; f.state.account[0].person.birthDate = null;
  f.state.session.push({ id: sessionId, accountId: f.ownerId, expiresAt: new Date(+f.now() + 3600000), mfaVersion: 0 });
  const calls = [];
  const details = createManualIdentityDetailsService({ prisma: f.db, now: f.now, verify: async (password, hash) => { calls.push({ password, hash }); return verify ? verify(f, password, hash) : password === " correct password "; } });
  return { ...f, details, ownerSessionId: sessionId, calls, input: () => ({ expectedIdentityRevision: 0, password: " correct password ", changes: { birthDate: "2001-04-17" } }) };
}
test("legacy readiness reports exactly which owner details are missing without disclosing stored date of birth", async () => {
  const f = fixture(); const view = await f.service.owner(f.ownerId);
  assert.equal(view.eligibility.requirementsMet, true); assert.equal(view.identityDetailsComplete, false); assert.equal(view.canSubmit, false);
  assert.deepEqual(view.missingIdentityFields, ["birthDate"]); assert.equal(view.identityDetailsRevision, 0);
  await f.details.complete(f.ownerId, f.ownerSessionId, f.input());
  const after = await f.service.owner(f.ownerId); assert.equal(after.canSubmit, true); assert.equal(after.identityDetailsComplete, true);
  assert.deepEqual(after.missingIdentityFields, []); assert.equal(after.identityDetailsRevision, 1);
  assert(!JSON.stringify(after).includes("2001-04-17")); assert.equal(f.state.profile[0].version, 1);
  assert.equal(f.state.account[0].person.firstName, "Sample"); assert.equal(f.calls[0].password, " correct password ");
  const audit = f.state.manualIdentityAudit.filter((a) => a.action === "MISSING_IDENTITY_DETAILS_COMPLETED"); assert.equal(audit.length, 1);
  assert(!JSON.stringify(audit).includes("2001-04-17")); assert(!JSON.stringify(audit).includes("password"));
});
test("missing details completion neither grants identity verification nor bypasses the three prerequisite checks", async () => {
  const f = fixture(); f.state.profile[0].educationRecords[0].status = "DRAFT";
  await f.details.complete(f.ownerId, f.ownerSessionId, f.input()); const view = await f.service.owner(f.ownerId);
  assert.equal(view.identityDetailsComplete, true); assert.equal(view.canSubmit, false); assert.equal(view.identityVerified, false);
  await assert.rejects(f.service.submit(f.ownerId, f.submission()), { status: 403 });
});
test("strict fields and calendar validation reject ownership injection, incomplete missing fields, invalid and future dates before expensive work", async () => {
  const f = fixture(); const body = f.input();
  for (const bad of [{ ...body, accountId: f.otherId }, { ...body, changes: { ...body.changes, identityVerified: true } }, { ...body, changes: {} },
    { ...body, changes: { birthDate: "2000-02-30" } }, { ...body, changes: { birthDate: "2027-01-01" } }]) await assert.rejects(f.details.complete(f.ownerId, f.ownerSessionId, bad), { status: 400 });
  assert.equal(f.calls.length, 0); assert.equal(f.state.account[0].person.birthDate, null);
});
test("existing names and date of birth cannot be overwritten through missing-details completion", async () => {
  const f = fixture(); await assert.rejects(f.details.complete(f.ownerId, f.ownerSessionId, { ...f.input(), changes: { birthDate: "2001-04-17", firstName: "Changed" } }), { status: 409 });
  await f.details.complete(f.ownerId, f.ownerSessionId, f.input());
  await assert.rejects(f.details.complete(f.ownerId, f.ownerSessionId, { ...f.input(), expectedIdentityRevision: 1, changes: { birthDate: "2002-01-01" } }), { status: 409 });
  assert.equal(f.state.account[0].person.birthDate.toISOString().slice(0, 10), "2001-04-17");
});
test("missing legacy names and date of birth must be completed together without changing saved profile drafts", async () => {
  const f = fixture(); f.state.account[0].person.firstName = "  "; f.state.account[0].person.lastName = "";
  await assert.rejects(f.details.complete(f.ownerId, f.ownerSessionId, f.input()), { status: 409 });
  await f.details.complete(f.ownerId, f.ownerSessionId, { ...f.input(), changes: { firstName: "  New  ", lastName: "Owner", birthDate: "2001-04-17" } });
  assert.equal(f.state.account[0].person.firstName, "New"); assert.equal(f.state.account[0].person.lastName, "Owner"); assert.equal(f.state.profile[0].version, 1);
});
test("wrong password attempts persist and the account-scoped budget survives service recreation and concurrent guesses", async () => {
  const f = fixture(); const body = { ...f.input(), password: "wrong" };
  const results = await Promise.allSettled(Array.from({ length: 7 }, () => f.details.complete(f.ownerId, f.ownerSessionId, body)));
  assert.equal(results.filter((r) => r.reason?.status === 400).length, 5); assert.equal(results.filter((r) => r.reason?.status === 429).length, 2);
  assert.equal(f.state.manualIdentityAudit.filter((a) => a.action === "IDENTITY_DETAILS_PASSWORD_ATTEMPT").length, 5);
  const recreated = createManualIdentityDetailsService({ prisma: f.db, now: f.now, verify: async () => true });
  await assert.rejects(recreated.complete(f.ownerId, f.ownerSessionId, f.input()), { status: 429 });
  f.advance(15 * 60000 + 1); await recreated.complete(f.ownerId, f.ownerSessionId, f.input());
  assert.equal(f.state.account[0].person.identityRevision, 1);
});
test("concurrent completions have one winner and stale revisions cannot overwrite that date", async () => {
  const f = fixture(); const outcomes = await Promise.allSettled([f.details.complete(f.ownerId, f.ownerSessionId, f.input()), f.details.complete(f.ownerId, f.ownerSessionId, { ...f.input(), changes: { birthDate: "2002-01-01" } })]);
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1); assert.equal(outcomes.find((r) => r.status === "rejected").reason.status, 409);
  assert.equal(f.state.manualIdentityAudit.filter((a) => a.action === "MISSING_IDENTITY_DETAILS_COMPLETED").length, 1);
});
test("revoked, foreign or expired sessions cannot complete details; enabled MFA still requires the current factor", async () => {
  const f = fixture();
  await assert.rejects(f.details.complete(f.ownerId, f.sessionId, f.input()), { status: 401 });
  await assert.rejects(f.details.complete(f.ownerId, undefined, f.input()), { status: 401 });
  f.state.session.find((s) => s.id === f.ownerSessionId).expiresAt = f.now();
  await assert.rejects(f.details.complete(f.ownerId, f.ownerSessionId, f.input()), { status: 401 });
  f.state.session.find((s) => s.id === f.ownerSessionId).expiresAt = new Date(+f.now() + 3600000);
  f.state.mfaFactor.push({ accountId: f.ownerId, enabled: true, version: 1 });
  await assert.rejects(f.details.complete(f.ownerId, f.ownerSessionId, f.input()), { status: 403 });
  assert.equal(f.state.account[0].person.birthDate, null);
});
test("password, session or account changes during verification prevent a personal-data write", async () => {
  for (const kind of ["password", "session", "status"]) {
    const f = fixture((state) => {
      if (kind === "password") state.state.account[0].passwordHash = "changed-hash";
      if (kind === "session") state.state.session = state.state.session.filter((s) => s.accountId !== state.ownerId);
      if (kind === "status") state.state.account[0].status = "SUSPENDED";
      return true;
    });
    await assert.rejects(f.details.complete(f.ownerId, f.ownerSessionId, f.input()), { status: 401 }); assert.equal(f.state.account[0].person.birthDate, null);
  }
});
test("failed completion audit rolls the Person write back while retaining the committed password attempt", async () => {
  const f = fixture(); const create = f.db.manualIdentityAudit.create;
  f.db.manualIdentityAudit.create = async (args) => { if (args.data.action === "MISSING_IDENTITY_DETAILS_COMPLETED") throw Error("audit unavailable"); return create(args); };
  await assert.rejects(f.details.complete(f.ownerId, f.ownerSessionId, f.input())); assert.equal(f.state.account[0].person.birthDate, null);
  assert.equal(f.state.manualIdentityAudit.filter((a) => a.action === "IDENTITY_DETAILS_PASSWORD_ATTEMPT").length, 1);
});
test("details HTTP binds the owner to the cookie, rejects untrusted origins and returns no private input", async () => {
  const f = fixture(), app = express(); app.use(express.json());
  app.use("/api/v1", createManualIdentityReviewRoutes({ reviews: { ...f.service, completeDetails: f.details.complete }, sessions: { async authenticate(token) {
    if (token !== "owner") throw Object.assign(Error("Login required"), { status: 401 });
    return { account: { id: f.ownerId }, sessionId: f.ownerSessionId };
  } }, clientUrl: "http://localhost:5173", nodeEnv: "test", limiter: (req, res, next) => next() }));
  app.use((error, req, res, next) => { void next; res.status(error.status ?? 500).json({ success: false, message: error.message }); });
  const server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/manual-identity/details`, headers = { "Content-Type": "application/json", Cookie: "brightway_session=owner", Origin: "http://localhost:5173" };
  try {
    assert.equal((await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f.input()) })).status, 401);
    assert.equal((await fetch(url, { method: "POST", headers: { ...headers, Origin: "https://foreign.invalid" }, body: JSON.stringify(f.input()) })).status, 403);
    const result = await fetch(url, { method: "POST", headers, body: JSON.stringify(f.input()) });
    assert.equal(result.status, 200); assert.equal(result.headers.get("cache-control"), "no-store"); assert.deepEqual(await result.json(), { success: true, data: { saved: true } });
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
