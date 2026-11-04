import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { manualReviewFixture } from "../test-support/manual-identity-review-fixture.js";
import { credentialFixture } from "../test-support/credential-fixture.js";
import { createManagementTransition } from "../src/modules/management/management-transition.js";
import { cleanupManagementAuthentication } from "../src/modules/management/management-cleanup.js";
function identity(kind) {
  const f = manualReviewFixture(), id = randomUUID(), attemptId = randomUUID(), previous = f.otherId, targetAt = new Date(+f.now() + 86400000);
  f.state.managementStaff[0].isSuperAdmin = true;
  const actor = { staffId: f.reviewerId, sessionId: f.sessionId };
  const row = { id, accountId: f.ownerId, state: "IN_REVIEW", version: 3, reviewerId: previous, currentAttemptId: attemptId, targetAt };
  if (kind === "identities") { f.state.manualIdentityRequest.push(row); f.state.manualIdentityAttempt.push({ id: attemptId, requestId: id, reviewerId: previous, state: "IN_REVIEW", snapshot: { immutable: true }, evidence: ["private-evidence"], targetAt }); }
  else f.state[kind === "photos" ? "profilePhotoReview" : "identityNameChange"].push(row);
  return { ...f, actor, id, previous, row, service: createManagementTransition({ prisma: f.db, now: f.now }) };
}
for (const kind of ["identities", "photos", "names"]) test(`legacy ${kind} release preserves deadlines, evidence and attributed historical events`, async () => {
  const f = identity(kind), deadline = +f.row.targetAt;
  const result = await f.service.release(f.actor, kind, f.id, 3, "Explicit obsolete personal assignment transition.");
  assert.equal(result.version, 4); assert.equal(+f.row.targetAt, deadline);
  assert.equal(f.state.managementStaffAudit.at(-1).data.previousActorId, f.previous);
  if (kind === "identities") { assert.deepEqual(f.state.manualIdentityAttempt[0].snapshot, { immutable: true }); assert.deepEqual(f.state.manualIdentityAttempt[0].evidence, ["private-evidence"]); }
  await assert.rejects(f.service.release(f.actor, kind, f.id, 3, "Stale assignment release cannot change history."), { status: 409 });
});
test("legacy transitions fail closed for non-root, management assignments, final decisions and audit failures", async () => {
  for (const mode of ["staff", "management", "final", "audit"]) {
    const f = identity("names");
    if (mode === "staff") f.state.managementStaff[0].isSuperAdmin = false;
    if (mode === "management") f.row.reviewerId = f.reviewerId;
    if (mode === "final") f.row.state = "APPROVED";
    if (mode === "audit") f.db.managementStaffAudit.create = async () => { throw Error("Transition audit failed"); };
    await assert.rejects(f.service.release(f.actor, "names", f.id, 3, "Audit rollback must preserve unfinished assignment."));
    assert.equal(f.state.identityNameChange[0].version, 3); assert.equal(f.state.identityNameChange[0].reviewerId, mode === "management" ? f.reviewerId : f.previous);
  }
});
test("credential transition releases only unlisted unfinished claims and preserves original revisions and snapshots", async () => {
  const f = credentialFixture(), id = randomUUID(), previous = f.otherId;
  f.state.managementStaff[0].isSuperAdmin = true; f.state.educationRecord[0].status = "IN_REVIEW";
  f.state.credentialReview.push({ id, profileId: f.profileId, recordId: f.recordId, kind: "education", revision: 1, status: "IN_REVIEW", reviewerId: previous, version: 2, issuerOrganizationId: null, initialSubmittedAt: f.now() });
  f.state.credentialAttempt.push({ id: randomUUID(), reviewId: id, status: "IN_REVIEW", reviewerId: previous, createdAt: f.now(), snapshot: { institution: "Original saved school" } });
  const service = createManagementTransition({ prisma: f.db, now: f.now }), actor = { staffId: f.reviewerId, sessionId: f.reviewerSessionId };
  const result = await service.release(actor, "credentials", id, 2, "Explicit obsolete reviewer assignment transition.");
  assert.equal(result.state, "SUBMITTED"); assert.equal(f.state.educationRecord[0].revision, 1); assert.equal(f.state.profile[0].version, 2);
  assert.deepEqual(f.state.credentialAttempt[0].snapshot, { institution: "Original saved school" });
  assert.equal(f.state.managementStaffAudit[0].data.previousActorId, previous);
  assert.equal(+f.state.credentialReview[0].initialSubmittedAt, +f.now());
});
test("management auth cleanup removes expired/consumed proofs and sessions while retaining live proofs, staff factors and audits", async () => {
  const f = manualReviewFixture(), now = f.now(), staff = structuredClone(f.state.managementStaff);
  f.state.managementChallenge.push({ id: "expired", expiresAt: now, consumedAt: null }, { id: "consumed", expiresAt: new Date(+now + 10000), consumedAt: now }, { id: "live", expiresAt: new Date(+now + 10000), consumedAt: null });
  const result = await cleanupManagementAuthentication(f.db, now); assert.equal(result.challenges, 2); assert.equal(f.state.managementChallenge[0].id, "live"); assert.deepEqual(f.state.managementStaff, staff);
});
