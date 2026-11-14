import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createOpportunityService } from "../src/modules/opportunities/opportunity.service.js";
import { createNotificationsService } from "../src/modules/notifications/notifications.service.js";
import { seedOrganizationProfile, clearOrganizationProfiles } from "../test-support/organization-profile-seed.js";

const skip = !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a migrated isolated test database";
test("opportunities isolate tenants and private files, enforce completion, serialize submissions/reviews and preserve history", { skip }, async () => {
  const { PrismaClient } = await import("@prisma/client"), { PrismaPg } = await import("@prisma/adapter-pg");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }), transactionOptions: { timeout: 15000, maxWait: 10000 } });
  let timestamp = new Date("2030-01-15T12:00:00Z"); const now = () => timestamp;
  const accounts = [], organizations = [], requests = [], photos = [], objects = new Map();
  const storage = { check() {}, async put(k, b) { objects.set(k, b); }, async get(k) { return objects.get(k); }, async delete(k) { objects.delete(k); } };
  const service = createOpportunityService({
    prisma: db, storage, imageStorage: storage, now,
    processFile: async bytes => ({ bytes, contentType: "application/pdf" }),
    processImage: async bytes => ({ bytes }),
    processBackground: async bytes => ({ bytes }),
  });
  const notifications = createNotificationsService({ prisma: db, now });
  async function person(label, complete = false) {
    const marker = randomUUID().slice(0, 8);
    const row = await db.account.create({ data: { username: `opp_${label}_${marker}`, email: `${label}_${marker}@example.invalid`, emailVerifiedAt: now(), passwordHash: "unusable-synthetic", person: { create: { firstName: "Synthetic", lastName: label, phoneNumber: "+231770000000" } } } }); accounts.push(row);
    await db.mfaFactor.create({ data: { accountId: row.id, enabled: true, encryptedSecret: "synthetic", version: 1, windowStart: now() } });
    const session = await db.session.create({ data: { accountId: row.id, tokenHash: randomUUID(), expiresAt: new Date("2031-01-01"), mfaVerifiedAt: now(), mfaVersion: 1 } });
    if (complete) {
      const photo = await db.photoAsset.create({ data: { personId: row.personId, storageKey: "synthetic/" + randomUUID(), state: "CLAIMED", expiresAt: now() } }); photos.push(photo.id);
      await db.profile.create({ data: { personId: row.personId, photoId: photo.id, headline: "Research assistant", countryCode: "LR", region: "Montserrado", locality: "Monrovia", careerFieldMode: "EXPLORING", skills: ["Data analysis"], interests: ["Education"], educationMode: "NONE", experienceMode: "NONE" } });
    }
    return { ...row, actor: { accountId: row.id, sessionId: session.id } };
  }
  async function organization(owner) {
    const r = await db.organizationRequest.create({ data: { applicantId: owner.id, assignedAgentId: accounts[1].id, decidedById: accounts[3].id, decidedAt: now(), version: 4, status: "APPROVED", idempotencyKey: randomUUID(), inputHash: "a".repeat(64), fingerprint: randomUUID(), name: "Synthetic Research " + randomUUID().slice(0, 8), type: "COMPANY", representativeRole: "Director", countryCode: "LR", region: "Montserrado", city: "Monrovia", address: "Synthetic test address", offersTraining: false, targetAt: now() } }); requests.push(r.id);
    const org = await db.organization.create({ data: { requestId: r.id, name: r.name, type: "COMPANY", offersTraining: false, verifiedAt: now(), memberships: { create: { accountId: owner.id, role: "PRIMARY_ADMIN" } } } }); organizations.push(org.id);
    return seedOrganizationProfile(db, org.id, now());
  }
  const listing = (type, questions = []) => ({ type, title: "Research assistant " + type, description: "Help our team improve community education and research outcomes.", location: "Monrovia, Liberia", workMode: "IN_PERSON", deadline: "2030-02-01T12:00:00Z", questions, requestKey: randomUUID() });
  const payload = (opp, answers = {}, expectedVersion = 0, action = "SUBMIT") => ({ action, shareProfile: action === "SUBMIT", expectedOpportunityVersion: opp.version, expectedVersion, answers });
  const question = (type, required = true) => ({ id: randomUUID(), label: `Your ${type} response`, type, required, options: type === "MULTIPLE_CHOICE" ? ["Coding", "Writing"] : [] });
  try {
    const owner = await person("owner", true), reviewer = await person("reviewer"), applicant = await person("applicant", true), outsider = await person("outsider"), otherOwner = await person("foreign", true);
    const org = await organization(owner), foreign = await organization(otherOwner);
    await db.organizationMembership.create({ data: { organizationId: org.id, accountId: reviewer.id, role: "STAFF", permissions: ["organization.applications.review"] } });
    await db.organizationMembership.create({ data: { organizationId: org.id, accountId: outsider.id, role: "STAFF", permissions: ["organization.opportunities.manage"] } });
    const yes = question("YES_NO"), choice = question("MULTIPLE_CHOICE"), file = question("FILE_UPLOAD"), short = question("SHORT_ANSWER");
    const body = listing("JOB", [yes, choice, file, short]);
    const draft = await service.create(owner.actor, org.id, body);
    assert.equal((await service.create(owner.actor, org.id, body)).id, draft.id);
    await assert.rejects(service.create(owner.actor, org.id, { ...body, title: "Changed retry" }), { status: 409 });
    assert.equal((await service.browse(applicant.actor, {})).items.some(o => o.id === draft.id), false);
    await assert.rejects(service.detail(applicant.actor, draft.id), { status: 404 });
    await assert.rejects(service.create(reviewer.actor, org.id, listing("JOB")), { status: 403 });
    await assert.rejects(service.reviewList(outsider.actor, org.id, {}), { status: 403 });
    await assert.rejects(service.list(otherOwner.actor, org.id, {}), { status: 403 });
    let opp = await service.setStatus(owner.actor, org.id, draft.id, { expectedVersion: draft.version, status: "PUBLISHED" });
    const otherListings = [];
    const sponsorLogo = await service.uploadChallengeAsset(owner.actor, org.id, { kind: "SPONSOR_LOGO" }, Buffer.from("sponsor"), "image/png");
    const background = await service.uploadChallengeAsset(owner.actor, org.id, { kind: "BACKGROUND" }, Buffer.from("background"), "image/png");
    const titleImage = await service.uploadChallengeAsset(owner.actor, org.id, { kind: "TITLE_IMAGE" }, Buffer.from("title"), "image/png");
    const cover = await service.uploadChallengeAsset(owner.actor, org.id, { kind: "COVER" }, Buffer.from("cover"), "image/png");
    const candidates = await service.searchCollaborators(owner.actor, org.id, { q: "Synthetic Research" });
    assert(candidates.items.some(item => item.id === foreign.id && item.profilePhotoId));
    assert.equal(candidates.items.some(item => item.id === org.id), false, "publishers cannot invite themselves");
    await assert.rejects(service.readChallengeAsset(applicant.actor, sponsorLogo.id), { status: 403 },
      "unpublished Challenge images are accessible only to authorized organization staff");
    await assert.rejects(service.create(otherOwner.actor, foreign.id, {
      ...listing("CHALLENGE"), sponsorLogoIds: [sponsorLogo.id],
    }), { status: 400 }, "one organization cannot attach another organization's image");
    for (const type of ["SCHOLARSHIP", "CHALLENGE", "EVENT"]) {
      const request = { ...listing(type), ...(type === "CHALLENGE" ? {
        prize: "US$500", coverImage: "SCHOOLS", topics: ["Education", "Technology"],
        prizes: [{ type: "CASH", amount: 500, currency: "USD" }, { type: "CERTIFICATE", title: "Award certificate", issuer: "" }],
        sponsorLogoIds: [sponsorLogo.id], backgroundAssetId: background.id, titleAssetId: titleImage.id,
        coverAssetId: cover.id, collaboratorIds: [foreign.id], maxApplicants: 1,
      } : {}) };
      const row = await service.create(owner.actor, org.id, request);
      if (type === "CHALLENGE") {
        assert.equal(row.collaborators.length, 1);
        assert.equal(row.collaborators[0].state, "PENDING");
        const invitations = await service.collaborationInvitations(otherOwner.actor, foreign.id);
        assert(invitations.items.some(invite => invite.opportunityId === row.id && invite.state === "PENDING"));
        const before = await db.opportunity.findUnique({
          where: { id: row.id }, select: { collaborators: { where: { state: "ACCEPTED" }, select: { id: true } } },
        });
        assert.equal(before.collaborators.length, 0, "pending co-hosts cannot appear publicly");
        await assert.rejects(service.respondCollaboration(owner.actor, org.id, row.id, { decision: "ACCEPTED" }),
          { status: 404 }, "host may not accept invitations on another organization’s behalf");
        const accepted = await service.respondCollaboration(otherOwner.actor, foreign.id, row.id, { decision: "ACCEPTED" });
        assert.equal(accepted.state, "ACCEPTED");
        await assert.rejects(service.respondCollaboration(otherOwner.actor, foreign.id, row.id, { decision: "DECLINED" }),
          { status: 409 }, "accepted co-hosting requires a fresh invitation to change status");
      }
      otherListings.push(await service.setStatus(owner.actor, org.id, row.id, { expectedVersion: row.version, status: "PUBLISHED" }));
    }
    assert.deepEqual(new Set((await service.browse(applicant.actor, {})).items.filter(o => o.organizationId === org.id).map(o => o.type)), new Set(["JOB", "SCHOLARSHIP", "CHALLENGE", "EVENT"]));
    assert.equal((await service.browse(applicant.actor, { type: "SCHOLARSHIP" })).items.filter(o => o.organizationId === org.id).length, 1);
    const publishedChallenge = (await service.browse(applicant.actor, { type: "CHALLENGE" })).items
      .find(o => o.organizationId === org.id);
    assert.deepEqual(publishedChallenge.topics, ["Education", "Technology"]);
    assert.equal(publishedChallenge.coverImage, "SCHOOLS");
    assert.deepEqual(publishedChallenge.prizes.map(p => p.type), ["CASH", "CERTIFICATE"]);
    assert.equal(publishedChallenge.prize, "USD 500 · Award certificate");
    assert.equal(publishedChallenge.maxApplicants, 1);
    assert.equal(publishedChallenge.location, "BrightWay");
    assert.equal(publishedChallenge.workMode, "REMOTE");
    assert.deepEqual(publishedChallenge.sponsorLogoIds, [sponsorLogo.id]);
    assert.equal(publishedChallenge.backgroundAssetId, background.id);
    assert.equal(publishedChallenge.titleAssetId, titleImage.id);
    assert.equal(publishedChallenge.coverAssetId, cover.id);
    assert.equal(publishedChallenge.collaborators.length, 1);
    assert.equal(publishedChallenge.collaborators[0].organizationId, foreign.id);
    assert.equal(publishedChallenge.collaborators[0].state, "ACCEPTED");
    assert.equal((await service.readChallengeAsset(applicant.actor, cover.id)).bytes.toString(), "cover");
    assert.equal((await service.readChallengeAsset(applicant.actor, sponsorLogo.id)).bytes.toString(), "sponsor");
    assert.equal((await service.browse(applicant.actor, { q: "assistant" })).items.filter(o => o.organizationId === org.id).length, 4);
    assert.equal((await service.browse(applicant.actor, { q: "%_" })).items.length, 0, "search wildcards are treated literally");
    assert.equal((await service.browse(applicant.actor, { following: "true" })).items.length, 0);
    await db.networkFollow.create({ data: { followerId: applicant.id, targetOrganizationId: org.id, active: true, version: 1 } });
    assert.equal((await service.browse(applicant.actor, { following: "true" })).items.length, 4);
    await assert.rejects(service.saveApplication(outsider.actor, otherListings[0].id, payload(otherListings[0])), { status: 403 }, "incomplete profiles cannot submit");
    await assert.rejects(service.saveApplication(applicant.actor, otherListings[0].id, { ...payload(otherListings[0]), shareProfile: false }), { status: 400 });
    let app = await service.saveApplication(applicant.actor, opp.id, payload(opp, {}, 0, "SAVE"));
    await assert.rejects(service.application(outsider.actor, app.id), { status: 404 });
    assert.equal((await service.reviewList(reviewer.actor, org.id, {})).items.length, 0, "organization staff cannot read draft applications");
    await assert.rejects(service.reviewDetail(reviewer.actor, org.id, app.id), { status: 404 });
    await assert.rejects(service.upload(outsider.actor, app.id, { questionId: file.id, expectedVersion: app.version }, Buffer.from("synthetic"), "application/pdf"), { status: 404 });
    app = await service.upload(applicant.actor, app.id, { questionId: file.id, expectedVersion: app.version }, Buffer.from("synthetic PDF"), "application/pdf");
    assert.equal(app.files.length, 1); assert.equal("storageKey" in app.files[0], false);
    await assert.rejects(service.readFile(outsider.actor, app.id, app.files[0].id), { status: 404 });
    await assert.rejects(service.readFile(reviewer.actor, app.id, app.files[0].id, org.id), { status: 404 }, "draft files stay owner-only");
    const answers = { [yes.id]: false, [choice.id]: ["Coding"], [short.id]: "I work with community data." };
    const submissions = await Promise.allSettled([service.saveApplication(applicant.actor, opp.id, payload(opp, answers, app.version)), service.saveApplication(applicant.actor, opp.id, payload(opp, answers, app.version))]);
    assert.equal(submissions.filter(r => r.status === "fulfilled").length, 1); assert.equal(submissions.find(r => r.status === "rejected").reason.status, 409);
    app = submissions.find(r => r.status === "fulfilled").value;
    assert.equal(app.status, "SUBMITTED"); assert.equal(app.events.length, 1); assert.equal((await db.opportunityApplication.count({ where: { opportunityId: opp.id, applicantId: applicant.id } })), 1);
    const serialized = JSON.stringify(app.profileSnapshot); assert.equal(serialized.includes("@example.invalid"), false); assert.equal(serialized.includes("+231"), false);
    await db.profile.update({ where: { personId: applicant.personId }, data: { headline: "Changed later" } });
    assert.equal((await service.application(applicant.actor, app.id)).profileSnapshot.headline, "Research assistant", "submitted profiles are immutable snapshots");
    assert.equal((await service.readFile(reviewer.actor, app.id, app.files[0].id, org.id)).bytes.toString(), "synthetic PDF");
    await assert.rejects(service.readFile(outsider.actor, app.id, app.files[0].id, org.id), { status: 403 });
    await assert.rejects(service.reviewDetail(otherOwner.actor, foreign.id, app.id), { status: 404 });
    const review = await service.reviewDetail(reviewer.actor, org.id, app.id); assert.equal(review.canReview, true); assert.equal("applicantId" in review, false);
    const decisions = await Promise.allSettled([service.decide(reviewer.actor, org.id, app.id, { expectedVersion: app.version, status: "SHORTLISTED", feedback: "Interview invitation coming." }), service.decide(owner.actor, org.id, app.id, { expectedVersion: app.version, status: "SELECTED", feedback: "Welcome." })]);
    assert.equal(decisions.filter(r => r.status === "fulfilled").length, 1); assert.equal(decisions.find(r => r.status === "rejected").reason.status, 409);
    app = await service.application(applicant.actor, app.id); assert.equal(app.events.length, 2);
    const inbox = await notifications.list(applicant.actor); const notice = inbox.items.find(n => n.kind === "APPLICATION_STATUS"); assert.equal(notice.application.id, app.id);
    assert.equal((await notifications.list(outsider.actor)).items.some(n => n.kind === "APPLICATION_STATUS"), false);
    assert.equal((await notifications.markRead(outsider.actor, notice.id)).updated, false);
    assert.equal((await notifications.markRead(applicant.actor, notice.id)).updated, true);
    assert.equal((await notifications.list(applicant.actor, null, "unread")).items.length, 0);
    await notifications.dismiss(applicant.actor, notice.id); assert.equal((await notifications.list(applicant.actor)).items.length, 0);
    await db.organizationMembership.update({ where: { organizationId_accountId: { organizationId: org.id, accountId: reviewer.id } }, data: { enabled: false } });
    await assert.rejects(service.reviewDetail(reviewer.actor, org.id, app.id), { status: 403 });
    await assert.rejects(service.readFile(reviewer.actor, app.id, app.files[0].id, org.id), { status: 403 });
    await db.mfaFactor.update({ where: { accountId: owner.id }, data: { version: 2 } });
    await assert.rejects(service.list(owner.actor, org.id, {}), { status: 401 });
    await db.mfaFactor.update({ where: { accountId: owner.id }, data: { version: 1 } });
    const ownApp = await service.saveApplication(owner.actor, otherListings[0].id, payload(otherListings[0]));
    await assert.rejects(service.decide(owner.actor, org.id, ownApp.id, { expectedVersion: ownApp.version, status: "SELECTED" }), { status: 403 });

    // Participation is not inferred from applications or saved challenges.
    // Applicants need separate opt-in and public identity approval.
    const challenge = otherListings.find(row => row.type === "CHALLENGE");
    const challengeSummary = async () => {
      const result = await service.browse(applicant.actor, { type: "CHALLENGE" });
      return result.items.find(row => row.id === challenge.id).participantSummary;
    };
    assert.deepEqual(await challengeSummary(), { count: 0, members: [] });
    let publicApp = await service.saveApplication(owner.actor, challenge.id, {
      ...payload(challenge), publicParticipant: true,
    });
    assert.equal(publicApp.publicParticipant, true, "separate public opt-in is persisted");
    await assert.rejects(service.saveApplication(applicant.actor, challenge.id, payload(challenge)),
      { status: 409 }, "the final applicant slot is reserved atomically when submitted");
    assert.deepEqual(await challengeSummary(), { count: 0, members: [] }, "unverified identity is not exposed");
    await db.manualIdentityRequest.create({ data: {
      accountId: owner.id, state: "APPROVED", currentAttemptId: randomUUID(),
      initialSubmittedAt: now(), targetAt: now(), windowStart: now(), calendarVersion: "synthetic",
    } });
    const visible = await challengeSummary();
    assert.equal(visible.count, 1);
    assert.equal(visible.members.length, 1);
    assert.equal(visible.members[0].username, owner.username);
    assert.equal(visible.members[0].verified, true);
    assert.equal("email" in visible.members[0], false, "private application fields never reach the feed");
    publicApp = await service.withdraw(owner.actor, publicApp.id, { expectedVersion: publicApp.version });
    assert.equal(publicApp.status, "WITHDRAWN");
    assert.deepEqual(await challengeSummary(), { count: 0, members: [] }, "withdrawn applicants disappear immediately");
    const admitted = await service.saveApplication(applicant.actor, challenge.id, payload(challenge));
    assert.equal(admitted.status, "SUBMITTED", "withdrawing releases the Challenge slot");
    assert.deepEqual(await challengeSummary(), { count: 0, members: [] }, "participants remain private by default");
    const paused = await service.setStatus(owner.actor, org.id, opp.id, { expectedVersion: opp.version, status: "PAUSED" });
    const { requestKey: ignored, ...editableBody } = body; void ignored;
    const edited = await service.edit(owner.actor, org.id, paused.id, { ...editableBody, expectedVersion: paused.version, description: "Updated description for future applicants at our organization." });
    assert.equal(edited.version, paused.version + 1, "JSONB key ordering cannot prevent legitimate paused edits");
    await assert.rejects(service.edit(owner.actor, org.id, paused.id, { ...editableBody, expectedVersion: edited.version, questions: [] }), { status: 409 });
    opp = await service.setStatus(owner.actor, org.id, edited.id, { expectedVersion: edited.version, status: "CLOSED" });
    await assert.rejects(service.saveApplication(otherOwner.actor, opp.id, payload(opp)), { status: 409 });
    assert.equal((await service.application(applicant.actor, app.id)).opportunitySnapshot.title, body.title);
    app = await service.withdraw(applicant.actor, app.id, { expectedVersion: app.version }); assert.equal(app.status, "WITHDRAWN");
    await assert.rejects(service.decide(owner.actor, org.id, app.id, { expectedVersion: app.version, status: "SELECTED" }), { status: 409 });
    timestamp = new Date("2030-02-01T12:00:00Z");
    assert.equal((await service.browse(applicant.actor, {})).items.filter(o => o.organizationId === org.id).length, 0);
    await assert.rejects(service.saveApplication(otherOwner.actor, otherListings[2].id, payload(otherListings[2])), { status: 409 });
    await db.organization.update({ where: { id: org.id }, data: { status: "SUSPENDED" } });
    await assert.rejects(service.detail(applicant.actor, otherListings[0].id), { status: 404 });
    assert.equal((await service.application(applicant.actor, app.id)).status, "WITHDRAWN", "owner keeps access to application history after organization suspension");
  } finally {
    try {
      const ids = accounts.map(a => a.id), appIds = (await db.opportunityApplication.findMany({ where: { applicantId: { in: ids } }, select: { id: true } })).map(a => a.id);
      await db.opportunityApplicationEvent.deleteMany({ where: { applicationId: { in: appIds } } }); await db.opportunityApplicationFile.deleteMany({ where: { applicationId: { in: appIds } } }); await db.opportunityApplication.deleteMany({ where: { id: { in: appIds } } });
      await db.opportunityAsset.deleteMany({ where: { organizationId: { in: organizations } } });
      await db.opportunityCollaborator.deleteMany({ where: { organizationId: { in: organizations } } });
      await db.opportunity.deleteMany({ where: { organizationId: { in: organizations } } }); await db.opportunityUploadBudget.deleteMany({ where: { accountId: { in: ids } } });
      await db.organizationStaffAudit.deleteMany({ where: { organizationId: { in: organizations } } }); await db.networkFollow.deleteMany({ where: { followerId: { in: ids } } });
      await clearOrganizationProfiles(db, organizations); await db.organizationMembership.deleteMany({ where: { organizationId: { in: organizations } } }); await db.organization.deleteMany({ where: { id: { in: organizations } } }); await db.organizationRequest.deleteMany({ where: { id: { in: requests } } });
      await db.profile.deleteMany({ where: { personId: { in: accounts.map(a => a.personId) } } }); await db.photoAsset.deleteMany({ where: { id: { in: photos } } }); await db.session.deleteMany({ where: { accountId: { in: ids } } }); await db.mfaFactor.deleteMany({ where: { accountId: { in: ids } } }); await db.manualIdentityRequest.deleteMany({ where: { accountId: { in: ids } } }); await db.account.deleteMany({ where: { id: { in: ids } } }); await db.person.deleteMany({ where: { id: { in: accounts.map(a => a.personId) } } });
    } finally { await db.$disconnect(); }
  }
});
