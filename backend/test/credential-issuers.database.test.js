import { seedOrganizationProfile, clearOrganizationProfiles } from "../test-support/organization-profile-seed.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createCredentialService } from "../src/modules/credentials/credential.service.js";
import { createOrganizationStaffService } from "../src/modules/organizations/organization-staff.service.js";
import { issuerPermission } from "../src/modules/credentials/credential-issuer.js";
test("database issuer review isolates tenants, serializes decisions/revocation and preserves snapshots and audits", { skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database" }, async () => {
  const { PrismaClient } = await import("@prisma/client"), { PrismaPg } = await import("@prisma/adapter-pg");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }), transactionOptions: { maxWait: 10000, timeout: 15000 } });
  const marker = randomUUID(), accounts = [], sessions = [], orgs = [], requests = [], profiles = [], date = new Date();
  const storage = { check() {}, async put() {}, async get() { return Buffer.from("private fixture"); }, async delete() {} };
  const service = createCredentialService({ prisma: db, storage, process: async bytes => ({ bytes, contentType: "application/pdf" }) });
  function failingAudit(client) { return new Proxy(client, { get(target, key) {
    if (key === "$transaction") return work => target.$transaction(tx => work(failingAudit(tx)));
    if (key === "credentialAuditEvent") return { create: async () => { throw Error("Injected credential audit failure"); } };
    const value = target[key]; return typeof value === "function" ? value.bind(target) : value;
  } }); }
  try {
    for (const label of ["owner", "review", "admin", "school", "foreign"]) {
      const account = await db.account.create({ data: { username: `iss_${label}_${marker.replaceAll("-", "").slice(0, 12)}`, email: `${label}_${marker}@example.invalid`, passwordHash: "unusable-fixture", emailVerifiedAt: date, platformRole: label === "admin" ? "CREDENTIAL_REVIEWER" : "MEMBER", person: { create: { firstName: "Synthetic", lastName: label } } } }); accounts.push(account);
      await db.mfaFactor.create({ data: { accountId: account.id, encryptedSecret: "synthetic-not-a-secret", enabled: true, version: 1, windowStart: date } });
      sessions.push(await db.session.create({ data: { accountId: account.id, tokenHash: randomUUID(), expiresAt: new Date(+date + 86400000), mfaVerifiedAt: date, mfaVersion: 1 } }));
    }
    const [owner, reviewer, admin, primary, foreign] = accounts;
    for (const [i, person] of [[0, primary], [1, foreign]]) {
      const request = await db.organizationRequest.create({ data: { applicantId: person.id, assignedAgentId: reviewer.id, decidedById: admin.id, status: "APPROVED", version: 4, idempotencyKey: randomUUID(), inputHash: "a".repeat(64), fingerprint: `${marker}_${i}`, name: `Issuer fixture ${i} ${marker}`, type: i ? "COMPANY" : "SCHOOL", representativeRole: "Director", countryCode: "GH", region: "", city: "Accra", address: "Synthetic", offersTraining: !i, targetAt: new Date(+date + 72 * 3600000), decidedAt: date } }); requests.push(request.id);
      const org = await db.organization.create({ data: { requestId: request.id, name: request.name, type: request.type, offersTraining: request.offersTraining, verifiedAt: date, memberships: { create: { accountId: person.id, role: "PRIMARY_ADMIN" } } } }); orgs.push(org.id); await seedOrganizationProfile(db, org.id, date);
    }
    const org = orgs[0], other = orgs[1];
    const member = await db.organizationMembership.create({ data: { organizationId: org, accountId: reviewer.id, role: "STAFF", permissions: [issuerPermission("education")] } });
    const profile = await db.profile.create({ data: { personId: owner.personId, educationMode: "RECORDS", experienceMode: "RECORDS", educationRecords: { create: { institution: "School fixture", qualification: "Diploma", startMonth: "2020-09", endMonth: "2023-06", current: false, description: "" } }, experienceRecords: { create: { organization: "Employer fixture", role: "Intern", type: "INTERNSHIP", startMonth: "2021-01", endMonth: "2021-04", current: false, description: "" } } }, include: { educationRecords: true, experienceRecords: true } }); profiles.push(profile.id);
    async function submit(kind, record, issuerOrganizationId) {
      const asset = await service.upload(owner.personId, kind, record.id, record.revision, Buffer.from("synthetic proof"), "application/pdf");
      const current = await db.profile.findUnique({ where: { id: profile.id } });
      await service.submit(owner.personId, owner.id, kind, record.id, { expectedVersion: current.version, revision: record.revision, evidenceIds: [asset.id], issuerOrganizationId });
      return { review: await db.credentialReview.findUnique({ where: { kind_recordId: { kind, recordId: record.id } } }), asset };
    }
    const { review, asset } = await submit("education", profile.educationRecords[0], org);
    assert.equal((await service.queue(admin.id, null, sessions[2].id)).reviews.length, 0);
    await assert.rejects(service.detail(admin.id, review.id, sessions[2].id), { status: 404 });
    await assert.rejects(service.detail(foreign.id, review.id, sessions[4].id, other), { status: 404 });
    await assert.rejects(service.queue(foreign.id, review.id, sessions[4].id, other), { status: 404 });
    const assign = () => service.transition(reviewer.id, review.id, { expectedVersion: 1 }, true, sessions[1].id, org);
    const failed = createCredentialService({ prisma: failingAudit(db), storage });
    await assert.rejects(failed.transition(reviewer.id, review.id, { expectedVersion: 1 }, true, sessions[1].id, org), /Injected credential audit failure/);
    assert.equal((await db.credentialReview.findUnique({ where: { id: review.id } })).status, "SUBMITTED");
    assert.equal((await db.profile.findUnique({ where: { id: profile.id } })).version, 1);
    const raced = await Promise.allSettled([assign(), assign()]); assert.equal(raced.filter(r => r.status === "fulfilled").length, 1);
    assert.equal((await service.readEvidence(reviewer.id, reviewer.personId, asset.id, sessions[1].id)).bytes.toString(), "private fixture");
    const input = { expectedVersion: 2, revision: 1, status: "VERIFIED", note: "The school confirmed the exact fixture claim." };
    await assert.rejects(failed.transition(reviewer.id, review.id, input, false, sessions[1].id, org), /Injected credential audit failure/);
    assert.equal((await db.educationRecord.findUnique({ where: { id: review.recordId } })).status, "IN_REVIEW");
    // Hold the real staffing transaction after its audit write. The competing decision
    // passes its initial (old) authority read, then must recheck after revocation commits.
    let releaseRevoke, signalHeld, signalDecision;
    const held = new Promise(resolve => { signalHeld = resolve; }), released = new Promise(resolve => { releaseRevoke = resolve; });
    const decisionStarted = new Promise(resolve => { signalDecision = resolve; });
    function pauseStaffAudit(client) { return new Proxy(client, { get(target, key) {
      if (key === "$transaction") return work => target.$transaction(tx => work(pauseStaffAudit(tx)));
      if (key === "organizationStaffAudit") return { create: async args => { const row = await target.organizationStaffAudit.create(args); signalHeld(); await released; return row; } };
      const value = target[key]; return typeof value === "function" ? value.bind(target) : value;
    } }); }
    const decisionDb = new Proxy(db, { get(target, key) {
      if (key === "$transaction") return work => { signalDecision(); return target.$transaction(work); };
      const value = target[key]; return typeof value === "function" ? value.bind(target) : value;
    } });
    const staff = createOrganizationStaffService({ prisma: pauseStaffAudit(db) });
    const revoke = staff.change(primary.id, sessions[3].id, org, member.id, { expectedStaffVersion: 1, expectedVersion: 1, enabled: false, permissions: [] });
    let decision;
    try {
      await Promise.race([held, revoke.then(() => { throw Error("Expected a paused staffing audit"); })]);
      decision = createCredentialService({ prisma: decisionDb, storage }).transition(reviewer.id, review.id, input, false, sessions[1].id, org);
      // Attach the rejection handler immediately; either operation can finish first.
      const denied = assert.rejects(decision, { status: 403 });
      await Promise.race([decisionStarted, decision]); releaseRevoke();
      await revoke; await denied;
      assert.equal(await db.credentialAuditEvent.count({ where: { reviewId: review.id, action: "DECIDED" } }), 0);
    } finally { releaseRevoke(); await Promise.allSettled([revoke, ...(decision ? [decision] : [])]); }
    await assert.rejects(service.transition(reviewer.id, review.id, input, false, sessions[1].id, org), { status: 403 });
    await assert.rejects(service.readEvidence(reviewer.id, reviewer.personId, asset.id, sessions[1].id), { status: 404 });
    assert.equal((await service.detail(primary.id, review.id, sessions[3].id, org)).canReassign, true);
    await service.transition(primary.id, review.id, { expectedVersion: 2 }, true, sessions[3].id, org);
    const decide = () => service.transition(primary.id, review.id, { ...input, expectedVersion: 3 }, false, sessions[3].id, org);
    const decisions = await Promise.allSettled([decide(), decide()]); assert.equal(decisions.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(await db.credentialAuditEvent.count({ where: { reviewId: review.id, action: "DECIDED" } }), 1);
    assert.equal(await db.credentialAuditEvent.count({ where: { reviewId: review.id, action: "REASSIGNED" } }), 1);
    const attempt = await db.credentialAttempt.findFirst({ where: { reviewId: review.id } }); assert.equal(attempt.issuerOrganizationId, org); assert.equal(attempt.snapshot.institution, "School fixture");
    const experience = await submit("experience", profile.experienceRecords[0], other);
    await assert.rejects(service.detail(primary.id, experience.review.id, sessions[3].id, org), { status: 404 });
    await service.transition(foreign.id, experience.review.id, { expectedVersion: 1 }, true, sessions[4].id, other);
    await service.transition(foreign.id, experience.review.id, { expectedVersion: 2, revision: 1, status: "ACTION_REQUIRED", note: "Provide corrected employer dates and evidence." }, false, sessions[4].id, other);
    const changedProfile = await db.profile.findUnique({ where: { id: profile.id } });
    const replacement = await service.upload(owner.personId, "experience", experience.review.recordId, 1, Buffer.from("new"), "application/pdf");
    await assert.rejects(service.submit(owner.personId, owner.id, "experience", experience.review.recordId, { expectedVersion: changedProfile.version, revision: 1, evidenceIds: [replacement.id], issuerOrganizationId: null }), { status: 409 });
    assert.equal((await db.profile.findUnique({ where: { id: profile.id } })).version, changedProfile.version);
    assert.equal((await db.credentialEvidence.findUnique({ where: { id: replacement.id } })).attemptId, null);
    assert.equal((await db.account.findUnique({ where: { id: primary.id } })).platformRole, "MEMBER");
  } finally {
    try {
      const personIds = accounts.map(a => a.personId), ids = accounts.map(a => a.id);
      const reviews = await db.credentialReview.findMany({ where: { profileId: { in: profiles } }, select: { id: true } }), reviewIds = reviews.map(r => r.id);
      await db.credentialEvidence.deleteMany({ where: { personId: { in: personIds } } }); await db.credentialUploadBudget.deleteMany({ where: { personId: { in: personIds } } });
      await db.credentialAuditEvent.deleteMany({ where: { reviewId: { in: reviewIds } } }); await db.credentialAttempt.deleteMany({ where: { reviewId: { in: reviewIds } } }); await db.credentialReview.deleteMany({ where: { id: { in: reviewIds } } });
      await db.profile.deleteMany({ where: { id: { in: profiles } } });
      await db.organizationStaffAudit.deleteMany({ where: { organizationId: { in: orgs } } }); await db.organizationMembership.deleteMany({ where: { organizationId: { in: orgs } } }); await clearOrganizationProfiles(db, orgs); await db.organization.deleteMany({ where: { id: { in: orgs } } }); await db.organizationRequest.deleteMany({ where: { id: { in: requests } } });
      await db.session.deleteMany({ where: { accountId: { in: ids } } }); await db.mfaFactor.deleteMany({ where: { accountId: { in: ids } } }); await db.account.deleteMany({ where: { id: { in: ids } } }); await db.person.deleteMany({ where: { id: { in: personIds } } });
    } finally { await db.$disconnect(); }
  }
});
