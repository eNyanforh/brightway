import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { credentialFixture } from "../test-support/credential-fixture.js";
import { createCredentialService } from "../src/modules/credentials/credential.service.js";
import { createCredentialRoutes } from "../src/modules/credentials/credential.routes.js";
import { issuerPermission } from "../src/modules/credentials/credential-issuer.js";
import { submitSchema } from "../src/modules/credentials/credential.schema.js";
function fixture() {
  const f = credentialFixture();
  const org = { id: randomUUID(), requestId: randomUUID(), status: "ACTIVE", name: "Listed School", type: "SCHOOL", offersTraining: true, staffVersion: 1, username: "listed_school", profileReadyAt: f.now(), profileSetupStep: 5, profilePhotoId: randomUUID() };
  const foreign = { ...org, id: randomUUID(), requestId: randomUUID(), name: "Another issuer" };
  f.state.organization.push(org, foreign); f.state.organizationRequest.push({ id: org.requestId, status: "APPROVED" }, { id: foreign.requestId, status: "APPROVED" });
  const member = { id: randomUUID(), organizationId: org.id, accountId: f.otherId, enabled: true, role: "STAFF", permissions: [issuerPermission("education")], version: 1 };
  f.state.organizationMembership.push(member); const session = f.authorizeReviewer(f.otherId);
  const service = createCredentialService({ prisma: f.db, storage: f.storage, now: f.now, process: async bytes => ({ bytes, contentType: "application/pdf" }) });
  return { ...f, service, org, foreign, member, session,
    async submit(issuerOrganizationId = org.id, kind = "education", recordId = f.recordId) {
      const row = f.state[kind === "education" ? "educationRecord" : "experienceRecord"].find(r => r.id === recordId);
      const asset = await service.upload(f.personId, kind, recordId, row.revision, Buffer.from("synthetic evidence"), "application/pdf");
      await service.submit(f.personId, f.ownerId, kind, recordId, { expectedVersion: f.state.profile[0].version, revision: row.revision, evidenceIds: [asset.id], issuerOrganizationId });
      return { review: f.state.credentialReview.find(r => r.recordId === recordId), asset };
    },
    assign: review => service.transition(f.otherId, review.id, { expectedVersion: review.version }, true, session, org.id),
    decide: review => service.transition(f.otherId, review.id, { expectedVersion: review.version, revision: review.revision, status: "VERIFIED", note: "School confirms this exact saved credential." }, false, session, org.id),
  };
}
test("listed issuer binding is snapshotted and only the correct organization and credential kind can review", async () => {
  const f = fixture(), { review, asset } = await f.submit();
  assert.equal(review.issuerOrganizationId, f.org.id); assert.equal(f.state.credentialAttempt[0].issuerName, "Listed School");
  assert.equal((await f.service.queue(f.reviewerId, null, f.reviewerSessionId)).reviews.length, 0);
  await assert.rejects(f.service.detail(f.reviewerId, review.id, f.reviewerSessionId), { status: 404 });
  await assert.rejects(f.service.transition(f.reviewerId, review.id, { expectedVersion: 1 }, true, f.reviewerSessionId), { status: 404 });
  await assert.rejects(f.service.readEvidence(f.reviewerId, "foreign-person", asset.id, f.reviewerSessionId), { status: 404 });
  assert.equal((await f.service.queue(f.otherId, null, f.session, f.org.id)).reviews[0].id, review.id);
  await assert.rejects(f.service.detail(f.otherId, review.id, f.session, f.foreign.id), { status: 403 });
  f.state.organizationMembership.push({ ...f.member, id: randomUUID(), organizationId: f.foreign.id });
  await assert.rejects(f.service.detail(f.otherId, review.id, f.session, f.foreign.id), { status: 404 });
  await assert.rejects(f.service.queue(f.otherId, review.id, f.session, f.foreign.id), { status: 404 });
  await f.assign(review); await f.decide(f.state.credentialReview[0]); assert.equal(f.state.educationRecord[0].status, "VERIFIED");
  assert.equal(f.state.account[0].identityVerifiedAt, undefined);
});
test("unlisted and legacy reviews stay in the authorized BrightWay queue and cannot be claimed by an organization", async () => {
  const f = fixture(), { review } = await f.submit(null);
  assert.equal((await f.service.queue(f.reviewerId, null, f.reviewerSessionId)).reviews.length, 1);
  assert.equal((await f.service.queue(f.otherId, null, f.session, f.org.id)).reviews.length, 0);
  await assert.rejects(f.assign(review), { status: 404 });
  await f.service.transition(f.reviewerId, review.id, { expectedVersion: 1 }, true, f.reviewerSessionId);
});
test("MFA, current membership, exact kind and active verified issuer are required even with a valid cookie", async () => {
  for (const mode of ["mfa", "membership", "kind", "org", "approval", "account"]) {
    const f = fixture(), { review } = await f.submit();
    if (mode === "mfa") f.state.session.find(s => s.id === f.session).mfaVersion = 0;
    if (mode === "membership") f.member.enabled = false;
    if (mode === "kind") f.member.permissions = [issuerPermission("experience")];
    if (mode === "org") f.org.status = "SUSPENDED";
    if (mode === "approval") f.state.organizationRequest[0].status = "REJECTED";
    if (mode === "account") f.state.account.find(a => a.id === f.otherId).status = "SUSPENDED";
    await assert.rejects(f.assign(review)); assert.equal(f.state.credentialReview[0].status, "SUBMITTED");
  }
});
test("no self-review is possible for a primary administrator and queues omit their own claims", async () => {
  const f = fixture(), { review } = await f.submit(); const session = f.authorizeReviewer(f.ownerId);
  f.state.organizationMembership.push({ id: randomUUID(), organizationId: f.org.id, accountId: f.ownerId, enabled: true, role: "PRIMARY_ADMIN", permissions: [] });
  assert.equal((await f.service.queue(f.ownerId, null, session, f.org.id)).reviews.length, 0);
  await assert.rejects(f.service.detail(f.ownerId, review.id, session, f.org.id), { status: 403 });
  await assert.rejects(f.service.transition(f.ownerId, review.id, { expectedVersion: 1 }, true, session, f.org.id), { status: 403 });
});
test("private evidence requires assignment and is rechecked after storage I/O and reviewer revocation", async () => {
  const f = fixture(), { review, asset } = await f.submit();
  await assert.rejects(f.service.readEvidence(f.otherId, "not-owner", asset.id, f.session), { status: 403 });
  await f.assign(review); assert.equal((await f.service.readEvidence(f.otherId, "not-owner", asset.id, f.session)).bytes.toString(), "private");
  f.storage.get = async () => { f.member.enabled = false; return Buffer.from("secret"); };
  await assert.rejects(f.service.readEvidence(f.otherId, "not-owner", asset.id, f.session), { status: 404 });
  assert.equal((await f.service.readEvidence(f.ownerId, f.personId, asset.id)).bytes.toString(), "secret");
});
test("corrections preserve issuer snapshots and deadlines and cannot silently move to BrightWay", async () => {
  const f = fixture(), { review } = await f.submit(); await f.assign(review);
  await f.service.transition(f.otherId, review.id, { expectedVersion: 2, revision: 1, status: "ACTION_REQUIRED", note: "Please provide a readable replacement certificate." }, false, f.session, f.org.id);
  const initial = f.state.credentialReview[0].initialSubmittedAt; f.org.name = "Renamed School";
  const row = f.state.educationRecord[0]; row.revision++;
  const asset = await f.service.upload(f.personId, "education", row.id, row.revision, Buffer.from("replacement"), "application/pdf");
  const input = { expectedVersion: f.state.profile[0].version, revision: row.revision, evidenceIds: [asset.id], issuerOrganizationId: null };
  await assert.rejects(f.service.submit(f.personId, f.ownerId, "education", row.id, input), { status: 409 });
  await f.service.submit(f.personId, f.ownerId, "education", row.id, { ...input, issuerOrganizationId: f.org.id });
  assert.equal(+f.state.credentialReview[0].initialSubmittedAt, +initial); assert.equal(f.state.credentialAttempt.length, 2);
  assert(f.state.credentialAttempt.every(a => a.issuerName === "Listed School" && a.issuerOrganizationId === f.org.id));
});
test("revoked assignment recovery is versioned, audited and cannot steal a currently authorized review", async () => {
  const f = fixture(), { review } = await f.submit(); await f.assign(review);
  f.state.organizationMembership.push({ ...f.member, id: randomUUID(), accountId: f.reviewerId });
  const assign = () => f.service.transition(f.reviewerId, review.id, { expectedVersion: 2 }, true, f.reviewerSessionId, f.org.id);
  await assert.rejects(assign(), { status: 409 }); f.state.organizationMembership.find(m => m.id === f.member.id).enabled = false;
  const attempts = await Promise.allSettled([assign(), assign()]); assert.equal(attempts.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(f.state.credentialReview[0].reviewerId, f.reviewerId); assert.equal(f.state.credentialAuditEvent.at(-1).action, "REASSIGNED");
  await assert.rejects(f.decide(f.state.credentialReview[0]), { status: 403 });
});
test("submission/decision audit failure rolls issuer, proof claims, status and profile version back", async () => {
  const f = fixture(); f.db.credentialAuditEvent.create = async () => { throw Error("audit failed"); };
  await assert.rejects(f.submit(), /audit failed/); assert.equal(f.state.credentialReview.length, 0); assert.equal(f.state.profile[0].version, 1); assert.equal(f.state.credentialEvidence[0].attemptId, null);
  const g = fixture(), { review } = await g.submit(); await g.assign(review); const before = g.state.profile[0].version;
  g.db.credentialAuditEvent.create = async () => { throw Error("audit failed"); };
  await assert.rejects(g.decide(g.state.credentialReview[0]), /audit failed/); assert.equal(g.state.profile[0].version, before); assert.equal(g.state.educationRecord[0].status, "IN_REVIEW");
});
test("experience routes to its employer while non-training companies cannot accept education", async () => {
  const f = fixture(); f.org.type = "COMPANY"; f.org.offersTraining = false;
  await assert.rejects(f.submit(), { status: 409 }); assert.equal(f.state.credentialReview.length, 0);
  const id = randomUUID(); f.state.experienceRecord.push({ id, profileId: f.profileId, revision: 1, status: "DRAFT", organization: "Employer", role: "Intern", type: "INTERNSHIP", startMonth: "2020-09", endMonth: "2023-06", current: false, description: "" });
  const { review } = await f.submit(f.org.id, "experience", id); f.state.organizationMembership.find(m => m.id === f.member.id).permissions = [issuerPermission("experience")];
  await f.assign(review); await f.decide(f.state.credentialReview[0]); assert.equal(f.state.experienceRecord[0].status, "VERIFIED");
});
test("issuer directory returns only active approved capable issuers and rejects injected trust", async () => {
  const f = fixture(); assert.equal((await f.service.issuers("education", "Listed")).organizations.length, 1);
  f.org.status = "SUSPENDED"; assert.equal((await f.service.issuers("education", "Listed")).organizations.length, 0);
  assert(!submitSchema.safeParse({ expectedVersion: 1, revision: 1, evidenceIds: [randomUUID()], issuerOrganizationId: f.org.id, reviewerId: f.otherId }).success);
});
test("issuer HTTP requires session, MFA and trusted Origin and rejects forged scope", async t => {
  const f = fixture(), { review } = await f.submit(); const app = express(); app.use(express.json());
  const auth = { account: { id: f.otherId, person: { id: "not-owner" } }, sessionId: f.session, mfaVerified: true };
  app.use(createCredentialRoutes({ credentials: f.service, sessions: { authenticate: async token => { if (!token) throw Object.assign(Error("Sign in"), { status: 401 }); return auth; } }, clientUrl: "http://localhost:5173", nodeEnv: "development", limiter: (req, res, next) => next() }));
  app.use((e, req, res, next) => { void next; res.status(e.status || 500).json({ success: false, message: e.message }); });
  const server = app.listen(0, "127.0.0.1"); await new Promise(r => server.once("listening", r)); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/organization-workspace/${f.org.id}/credential-reviews`, headers = { Cookie: "brightway_session=test", Origin: "http://localhost:5173", "Content-Type": "application/json" };
  assert.equal((await fetch(base)).status, 401);
  let response = await fetch(base, { headers }); assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "no-store");
  auth.mfaVerified = false; assert.equal((await fetch(base, { headers })).status, 403); auth.mfaVerified = true;
  assert.equal((await fetch(base + `/${review.id}/assign`, { method: "POST", headers: { ...headers, Origin: "https://foreign.invalid" }, body: JSON.stringify({ expectedVersion: 1 }) })).status, 403);
  assert.equal((await fetch(base + `/${review.id}/assign`, { method: "POST", headers, body: JSON.stringify({ expectedVersion: 1, organizationId: f.foreign.id }) })).status, 400);
  assert.equal((await fetch(base + `/${review.id}/assign`, { method: "POST", headers, body: JSON.stringify({ expectedVersion: 1 }) })).status, 200);
});
