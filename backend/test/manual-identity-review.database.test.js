import { seedOrganizationProfile, clearOrganizationProfiles } from "../test-support/organization-profile-seed.js";
import { managementStaffFixture, managementSessionFixture, cleanupManagementFixtures } from "../test-support/management-database-fixture.js";
import { createOrganizationPosts } from "../src/modules/posts/organization-posts.service.js";
import { createMemberPostModeration } from "../src/modules/posts/member-post-moderation.service.js";
import { hashPassword } from "../src/modules/auth/password.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createManualIdentityEvidenceService, MANUAL_IDENTITY_CONSENT } from "../src/modules/manual-identity/manual-identity-evidence.service.js";
import { createManualIdentityReviewService } from "../src/modules/manual-identity/manual-identity-review.service.js";
import { reviewPolicy, MANUAL_REVIEW_CONSENT, submitIdentitySchema } from "../src/modules/manual-identity/manual-identity.policy.js";

test("database manual identity requests serialize retries and decisions, revoke stale trust and retain private audit on purge", {
  skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database",
}, async () => {
  const { PrismaClient } = await import("@prisma/client"), { PrismaPg } = await import("@prisma/adapter-pg");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }), transactionOptions: { maxWait: 10000, timeout: 15000 } });
  let date = new Date(), photo, organization, organizationRequest;
  const ownerPassword = "fixture-only legacy completion password";
  const passwordHash = await hashPassword(ownerPassword);
  const accounts = [], marker = randomUUID(), objects = new Map();
  const storage = { check() {}, async put(key, bytes) { objects.set(key, bytes); }, async get(key) { return objects.get(key); }, async delete(key) { objects.delete(key); } };
  const config = { prisma: db, storage, now: () => date, policy: reviewPolicy({ MANUAL_IDENTITY_RETENTION_DAYS: "30" }) };
  const reviews = createManualIdentityReviewService(config);
  const posts = createOrganizationPosts(config);
  const moderation = createMemberPostModeration(config);
  const uploads = createManualIdentityEvidenceService({ ...config, processImage: async () => ({ bytes: Buffer.from("test image"), width: 640, height: 480 }) });
  try {
    for (const label of ["owner"]) accounts.push(await db.account.create({ data: {
      username: `${label}_${marker.replaceAll("-", "")}`, email: `${label}_${marker}@example.invalid`, passwordHash, emailVerifiedAt: date,
      person: { create: { firstName: "Sample", lastName: label, birthDate: label === "owner" ? null : new Date("2000-01-01"), gender: "MALE", phoneNumber: "+231770000000" } },
    } }));
    accounts.push(await managementStaffFixture(db, { username: `reviewer_${marker.replaceAll("-", "").slice(0, 12)}`, email: `reviewer_${marker}@example.invalid` }, ["identity-reviewer"], date));
    const [owner, reviewer] = accounts;
    photo = await db.photoAsset.create({ data: { personId: owner.personId, storageKey: `test-photo-${marker}`, state: "CLAIMED", expiresAt: new Date(+date + 86400000) } });
    const profile = await db.profile.create({ data: {
      version: 1, personId: owner.personId, photoId: photo.id, countryCode: "US", locality: "City", headline: "Developer", careerFieldMode: "EXPLORING", skills: ["JavaScript"], interests: ["Technology"],
      educationMode: "RECORDS", experienceMode: "RECORDS",
      educationRecords: { create: { institution: "Fixture school", qualification: "Diploma", startMonth: "2018-09", endMonth: "2020-06", current: false, description: "", status: "VERIFIED" } },
      experienceRecords: { create: { organization: "Fixture employer", role: "Developer", type: "EMPLOYMENT", startMonth: "2020-07", endMonth: "2023-06", current: false, description: "", status: "VERIFIED" } },
    } });
    assert.equal(profile.version, 1, "The complete-profile fixture must represent a saved profile revision.");
    const legacy = await reviews.owner(owner.id);
    assert.equal(legacy.eligibility.requirementsMet, true); assert.equal(legacy.identityDetailsComplete, false);
    assert.deepEqual(legacy.missingIdentityFields, ["birthDate"]); assert.equal(legacy.canSubmit, false);
    const ownerSession = await db.session.create({ data: { accountId: owner.id, tokenHash: randomUUID(), expiresAt: new Date(+date + 7 * 86400000) } });
    const actor = { accountId: owner.id, sessionId: ownerSession.id };
    const draft = { body: "Sharing my verified learning journey.", requestKey: randomUUID(), tags: [" #Learning   Journeys "] };
    await assert.rejects(posts.memberPublish(actor, draft), { status: 403 });
    await reviews.completeDetails(owner.id, ownerSession.id, { expectedIdentityRevision: 0, password: ownerPassword, changes: { birthDate: "2000-01-01" } });
    assert.equal((await reviews.owner(owner.id)).canSubmit, true);
    assert.equal((await db.person.findUnique({ where: { id: owner.personId } })).identityRevision, 1);
    assert.equal((await db.profile.findUnique({ where: { id: profile.id } })).version, profile.version);
    assert.equal(await db.manualIdentityAudit.count({ where: { targetAccountId: owner.id, action: "MISSING_IDENTITY_DETAILS_COMPLETED" } }), 1);
    await assert.rejects(reviews.completeDetails(owner.id, ownerSession.id, { expectedIdentityRevision: 1, password: ownerPassword, changes: { birthDate: "2001-01-01" } }), { status: 409 });
    async function submission() {
      const images = [];
      for (const kind of ["GOVERNMENT_ID", "SELFIE"]) images.push(await uploads.upload(owner.id, kind, Buffer.from("input"), "image/png", MANUAL_IDENTITY_CONSENT));
      const state = await reviews.owner(owner.id);
      return submitIdentitySchema.parse({ expectedVersion: state.request?.version ?? 0, expectedProfileVersion: (await db.profile.findUnique({ where: { id: profile.id } })).version,
        governmentId: images[0].id, selfie: images[1].id, idempotencyKey: randomUUID(), consentVersion: MANUAL_REVIEW_CONSENT });
    }
    const data = await submission();
    const replay = await Promise.all([reviews.submit(owner.id, data), reviews.submit(owner.id, data)]);
    assert.equal(replay[0].attemptId, replay[1].attemptId);
    assert.equal(await db.manualIdentityRequest.count({ where: { accountId: owner.id } }), 1);
    const requestId = replay[0].requestId;
    assert.equal(await db.manualIdentityAttempt.count({ where: { requestId } }), 1);
    assert.equal(await db.manualIdentityEvidence.count({ where: { attemptId: replay[0].attemptId, state: "ATTACHED" } }), 2);
    await assert.rejects(reviews.access(reviewer.id, randomUUID()), { status: 403 });
    const session = await managementSessionFixture(db, reviewer, date, new Date(+date + 100 * 86400000));
    const request = await db.manualIdentityRequest.findUnique({ where: { id: requestId } });
    const assigned = await Promise.allSettled([1, 2].map(() => reviews.transition(reviewer.id, session.id, requestId, { expectedVersion: request.version }, true)));
    assert.equal(assigned.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(assigned.find((r) => r.status === "rejected").reason.status, 409);
    const current = await db.manualIdentityRequest.findUnique({ where: { id: requestId } });
    const decision = { expectedVersion: current.version, attemptId: current.currentAttemptId, status: "APPROVED", note: "Test-only review of the fixture ID and selfie snapshot." };
    const decisions = await Promise.allSettled([1, 2].map(() => reviews.transition(reviewer.id, session.id, requestId, decision)));
    assert.equal(decisions.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(decisions.find((r) => r.status === "rejected").reason.status, 409);
    assert.equal(await db.manualIdentityAudit.count({ where: { requestId, action: "DECIDED" } }), 1);
    assert.equal((await reviews.status(owner.id)).identityVerified, true);
    await assert.rejects(posts.memberPublish(actor, draft), { status: 403 });
    await db.profile.update({ where: { id: profile.id }, data: { profilePublicEnabled: true } });
    const [publication, retry] = await Promise.all([posts.memberPublish(actor, draft), posts.memberPublish(actor, draft)]);
    const postId = publication.post.id;
    assert.equal(retry.post.id, postId);
    assert.equal(publication.post.type, "POST");
    assert.equal(publication.post.moderationStatus, "PENDING");
    assert.equal(publication.post.moderationFeedback, null);
    assert.deepEqual(publication.post.tags, ["Learning Journeys"]);
    assert.deepEqual(publication.post.member, { username: owner.username, name: "Sample owner" });
    assert.deepEqual(Object.keys(publication.post).sort(), ["body", "createdAt", "id", "member", "moderationFeedback", "moderationStatus", "tags", "type"]);
    await assert.rejects(posts.memberPublish(actor, { ...draft, body: "Different content" }), { status: 409 });
    await assert.rejects(posts.memberPublish(actor, { ...draft, type: "EVENT" }), { status: 409 });
    await assert.rejects(posts.memberPublish(actor, { ...draft, tags: ["Skills"] }), { status: 409 });
    await assert.rejects(posts.memberPublish(actor, { body: draft.body, requestKey: randomUUID() }), { status: 400, message: "Add at least one topic tag before publishing." });
    await assert.rejects(posts.memberPublish(actor, { ...draft, tags: ["Research", "#research"], requestKey: randomUUID() }), { status: 400 });
    await assert.rejects(posts.memberPublish(actor, { ...draft, tags: ["One", "Two", "Three", "Four", "Five", "Six"], requestKey: randomUUID() }), { status: 400 });
    await assert.rejects(posts.memberPublish(actor, { ...draft, type: "OPPORTUNITY", requestKey: randomUUID() }), { status: 400 });
    await assert.rejects(posts.memberPublish(actor, { ...draft, moderationStatus: "PUBLISHED", requestKey: randomUUID() }), { status: 400 });
    const viewer = await db.account.create({ data: {
      username: `viewer_${marker}`, email: `viewer_${marker}@example.invalid`, passwordHash,
      person: { create: { firstName: "Synthetic", lastName: "Viewer" } },
    } });
    accounts.push(viewer);
    const viewerSession = await db.session.create({ data: { accountId: viewer.id, tokenHash: randomUUID(), expiresAt: new Date(+date + 7 * 86400000) } });
    const viewerActor = { accountId: viewer.id, sessionId: viewerSession.id };
    assert.equal((await posts.memberList(actor, {})).items[0].moderationStatus, "PENDING");
    assert.equal((await posts.memberList(viewerActor, {})).items.length, 0);
    assert.equal((await posts.feed(viewerActor, {})).items.some(item => item.id === postId), false);
    await assert.rejects(posts.comments(viewerActor, "member", postId, {}), { status: 404 });
    await assert.rejects(posts.setLike(viewerActor, "member", postId, { liked: true }), { status: 404 });
    await assert.rejects(posts.setSaved(viewerActor, "member", postId, { saved: true }), { status: 404 });
    await assert.rejects(posts.setReposted(actor, "member", postId, { reposted: true }), { status: 404 });
    await assert.rejects(moderation.list({ staffId: reviewer.id, sessionId: session.id }), { status: 403 });
    const moderator = await managementStaffFixture(db, { username: `moderator_${marker.slice(0, 8)}`, email: `moderator_${marker}@example.invalid` }, ["moderation-agent"], date);
    accounts.push(moderator);
    const moderatorSession = await managementSessionFixture(db, moderator, new Date(+date - 360000), new Date(+date + 86400000));
    const moderatorActor = { staffId: moderator.id, sessionId: moderatorSession.id };
    const approval = { decision: "PUBLISHED", reason: "The post describes a relevant learning experience.", requestKey: randomUUID() };
    const queued = (await moderation.list(moderatorActor)).items.find(item => item.id === postId);
    assert.equal(queued?.body, draft.body);
    assert.deepEqual(queued.author, { username: owner.username });
    await assert.rejects(moderation.decide(moderatorActor, postId, approval), { status: 403 });
    await db.managementSession.update({ where: { id: moderatorSession.id }, data: { mfaVerifiedAt: date } });
    const conflict = { staffId: moderator.id, accountId: owner.id };
    await db.managementConflict.create({ data: { ...conflict, reason: "Synthetic conflict declaration." } });
    assert.equal((await moderation.list(moderatorActor)).items.some(item => item.id === postId), false);
    await assert.rejects(moderation.decide(moderatorActor, postId, approval), { status: 403 });
    await db.managementConflict.delete({ where: { staffId_accountId: conflict } });
    const approve = id => moderation.decide(moderatorActor, id, { ...approval, requestKey: randomUUID() });
    const publishDecisions = await Promise.all([1, 2].map(() => moderation.decide(moderatorActor, postId, approval)));
    assert.deepEqual(publishDecisions, Array(2).fill({ id: postId, moderationStatus: "PUBLISHED" }));
    assert.equal(await db.managementAction.count({ where: { actorId: moderator.id, targetType: "MEMBER_POST", targetId: postId, action: "MEMBER_POST_PUBLISHED" } }), 1);
    await assert.rejects(approve(postId), { status: 409 });
    assert.equal((await moderation.list(moderatorActor)).items.some(item => item.id === postId), false);
    assert.equal((await posts.memberPublish(actor, draft)).post.moderationStatus, "PUBLISHED");
    const declinedDraft = { ...draft, body: "A synthetic post requiring changes.", requestKey: randomUUID() };
    const { post: declinedPost } = await posts.memberPublish(actor, declinedDraft);
    const rejection = { decision: "REJECTED", reason: "Describe the learning or career topic more clearly.", requestKey: randomUUID() };
    await moderation.decide(moderatorActor, declinedPost.id, rejection);
    const declined = (await posts.memberList(actor, {})).items.find(item => item.id === declinedPost.id);
    assert.equal(declined?.moderationStatus, "REJECTED");
    assert.equal(declined.moderationFeedback, rejection.reason);
    assert.equal((await posts.feed(viewerActor, {})).items.some(item => item.id === declined.id), false);
    await posts.memberWithdraw(actor, declined.id);
    const { post: withdrawnPost } = await posts.memberPublish(actor, { ...draft, requestKey: randomUUID() });
    await posts.memberWithdraw(actor, withdrawnPost.id);
    await assert.rejects(approve(withdrawnPost.id), { status: 409 });
    for (const type of ["ACHIEVEMENT", "EVENT"]) {
      const typedDraft = { body: "A member update.", requestKey: randomUUID(), type, tags: ["Research", "Community"] };
      const { post } = await posts.memberPublish(actor, typedDraft);
      assert.equal(post.type, type);
      assert.deepEqual(post.tags, typedDraft.tags);
      assert.deepEqual(await posts.memberPublish(actor, typedDraft), { post });
      await approve(post.id);
      const owned = (await posts.memberList(actor, {})).items.find(item => item.id === post.id);
      const visible = (await posts.feed(viewerActor, {})).items.find(item => item.id === post.id);
      assert.equal(owned?.type, type);
      assert.equal(visible?.type, type);
      assert.deepEqual(owned?.tags, typedDraft.tags);
      assert.deepEqual(visible?.tags, typedDraft.tags);
      await posts.memberWithdraw(actor, post.id);
    }
    const like = liked => posts.setLike(viewerActor, "member", postId, { liked });
    assert.deepEqual(await like(true), { reaction: { liked: true, count: 1 } });
    assert.deepEqual(await like(false), { reaction: { liked: false, count: 0 } });
    assert.deepEqual(await like(true), { reaction: { liked: true, count: 1 } });
    await assert.rejects(posts.setLike(viewerActor, "organization", postId, { liked: true }), { status: 404 });
    const save = saved => posts.setSaved(viewerActor, "member", postId, { saved });
    assert.deepEqual(await save(true), { saved: true });
    const savedFeed = cursor => posts.feed(viewerActor, { view: "saved", ...(cursor && { cursor }) });
    assert.deepEqual((await savedFeed()).items.map(item => [item.id, item.saved]), [[postId, true]]);
    const commentDraft = { body: "Thanks for sharing.", requestKey: randomUUID() };
    const commentAsViewer = () => posts.addComment(viewerActor, "member", postId, commentDraft);
    const commentsAsViewer = (query = {}) => posts.comments(viewerActor, "member", postId, query);
    await assert.rejects(commentAsViewer(), { status: 403 });
    await db.account.update({ where: { id: viewer.id }, data: { emailVerifiedAt: date } });
    const { comment } = await commentAsViewer();
    assert.deepEqual((await commentsAsViewer()).items, [comment]);
    const extraComments = Array.from({ length: 21 }, (_, index) => ({
      id: randomUUID(), authorId: viewer.id, memberPostId: postId, requestKey: randomUUID(), body: `Synthetic comment ${index}`, createdAt: date,
    }));
    await db.postComment.createMany({ data: extraComments });
    const commentPage = await commentsAsViewer();
    const olderComments = await commentsAsViewer({ cursor: commentPage.nextCursor });
    assert.equal(commentPage.items.length, 20);
    assert.equal(olderComments.nextCursor, null);
    assert.deepEqual([...commentPage.items, ...olderComments.items].map(item => item.id), [comment.id, ...extraComments.map(item => item.id)].sort().reverse());
    await assert.rejects(posts.comments(actor, "member", postId, { cursor: commentPage.nextCursor }), { status: 400 });
    await db.postComment.deleteMany({ where: { id: { in: extraComments.map(item => item.id) } } });
    const seesPost = async view => (await posts.feed(viewerActor, { view })).items.some(post => post.id === postId);
    assert.equal(await seesPost("for-you"), true);
    assert.equal(await seesPost("following"), false);
    await db.networkFollow.create({ data: { followerId: viewer.id, targetAccountId: owner.id, active: true } });
    assert.equal(await seesPost("following"), true);
    const extraPosts = Array.from({ length: 21 }, (_, index) => ({
      id: randomUUID(), authorId: owner.id, requestKey: randomUUID(), body: `Synthetic post ${index}`, moderationStatus: "PUBLISHED", createdAt: date,
    }));
    await db.memberPost.createMany({ data: extraPosts });
    const { id: legacyId, body: legacyBody, requestKey: legacyKey } = extraPosts[0];
    const { post: legacyPost } = await posts.memberPublish(actor, { body: legacyBody, requestKey: legacyKey });
    assert.equal(legacyPost.id, legacyId);
    assert.deepEqual(legacyPost.tags, []);
    const page = await posts.feed(viewerActor, { view: "following" });
    assert.equal(page.items.length, 20);
    assert.ok(page.nextCursor);
    await assert.rejects(posts.feed(viewerActor, { view: "for-you", cursor: page.nextCursor }), { status: 400 });
    const older = await posts.feed(viewerActor, { view: "following", cursor: page.nextCursor });
    assert.equal(older.nextCursor, null);
    assert.deepEqual([...page.items, ...older.items].map(post => post.id), [postId, ...extraPosts.map(post => post.id)].sort().reverse());
    const extraSaves = extraPosts.map((post, index) => ({
      accountId: viewer.id, memberPostId: post.id, createdAt: new Date(+date + index + 1),
    }));
    await db.postSave.createMany({ data: extraSaves });
    const savedFirst = await savedFeed();
    assert.ok(savedFirst.nextCursor);
    await assert.rejects(posts.feed(actor, { view: "saved", cursor: savedFirst.nextCursor }), { status: 400 });
    await assert.rejects(posts.feed(viewerActor, { view: "following", cursor: savedFirst.nextCursor }), { status: 400 });
    const savedSecond = await savedFeed(savedFirst.nextCursor);
    assert.equal(savedSecond.nextCursor, null);
    assert.deepEqual([...savedFirst.items, ...savedSecond.items].map(item => item.id), [...extraPosts.map(post => post.id).reverse(), postId]);
    await db.memberPost.deleteMany({ where: { id: { in: extraPosts.map(post => post.id) } } });
    organizationRequest = await db.organizationRequest.create({ data: {
      applicantId: viewer.id, assignedAgentId: reviewer.id, decidedById: owner.id,
      idempotencyKey: randomUUID(), inputHash: "a".repeat(64), fingerprint: marker,
      name: "Synthetic Repost Organization", type: "SCHOOL", representativeRole: "Director",
      countryCode: "LR", region: "Montserrado", city: "Monrovia", address: "Synthetic address",
      offersTraining: true, status: "APPROVED", decidedAt: date, targetAt: date,
    } });
    organization = await db.organization.create({ data: {
      requestId: organizationRequest.id, name: organizationRequest.name, type: "SCHOOL", offersTraining: true, verifiedAt: date,
    } });
    await seedOrganizationProfile(db, organization.id, date);
    await assert.rejects(posts.publish(actor, organization.id, draft), { status: 400 });
    const original = await db.organizationPost.create({ data: {
      organizationId: organization.id, authorId: viewer.id, requestKey: randomUUID(), body: "Synthetic school update.",
      createdAt: new Date(+date - 1000),
    } });
    const repost = reposted => posts.setReposted(actor, "organization", original.id, { reposted });
    await assert.rejects(posts.setReposted(viewerActor, "member", postId, { reposted: true }), { status: 403 });
    const copies = await Promise.all([repost(true), repost(true)]);
    assert.deepEqual(copies[0], copies[1]);
    assert.equal(await db.postRepost.count({ where: { organizationPostId: original.id } }), 1);
    const repostId = copies[0].repost.id;
    const republished = async view => (await posts.feed(viewerActor, { view })).items.find(item => item.repost?.id === repostId);
    const copy = await republished("following");
    assert.equal(copy.id, original.id);
    assert.equal(copy.body, original.body);
    assert.equal(copy.repost.mine, false);
    assert.equal(copy.repost.member.username, owner.username);
    assert.equal(copy.reposted, false);
    assert.equal(copy.authorId, undefined);
    assert.equal((await posts.feed(viewerActor, { view: "following" })).items.some(item => item.id === original.id && !item.repost), false);
    const selfRepost = await posts.setReposted(actor, "member", postId, { reposted: true });
    assert.equal((await posts.feed(viewerActor, {})).items.find(item => item.repost?.id === selfRepost.repost.id).id, postId);
    await posts.setReposted(actor, "member", postId, { reposted: false });
    await db.organizationPost.update({ where: { id: original.id }, data: { withdrawnAt: date } });
    assert.equal(await republished("following"), undefined);
    await db.organizationPost.update({ where: { id: original.id }, data: { withdrawnAt: null } });
    assert.ok(await republished("following"));
    await assert.rejects(posts.memberWithdraw(viewerActor, postId), { status: 404 });
    const [leftAccountId, rightAccountId] = [viewer.id, owner.id].sort();
    const block = await db.networkPair.create({ data: { leftAccountId, rightAccountId, rightBlocked: true } });
    assert.equal(await seesPost("for-you"), false);
    assert.equal(await seesPost("following"), false);
    await assert.rejects(like(true), { status: 404 });
    assert.equal(await republished("for-you"), undefined);
    await db.networkPair.delete({ where: { id: block.id } });
    await db.profile.update({ where: { id: profile.id }, data: { profilePublicEnabled: false } });
    assert.equal(await seesPost("for-you"), false);
    assert.equal((await posts.memberList(actor, {})).items[0].id, postId);
    await assert.rejects(commentsAsViewer(), { status: 404 });
    assert.deepEqual((await savedFeed()).items, []);
    assert.equal(await republished("for-you"), undefined);
    await assert.rejects(like(true), { status: 404 });
    await db.profile.update({ where: { id: profile.id }, data: { profilePublicEnabled: true } });
    assert.equal(await seesPost("for-you"), true);
    await db.profile.update({ where: { id: profile.id }, data: { headline: "Updated headline", version: { increment: 1 } } });
    assert.equal((await reviews.status(owner.id)).identityVerified, true);
    // Actual PostgreSQL triggers, rather than simulated hashes, protect change-and-revert.
    await db.person.update({ where: { id: owner.personId }, data: { firstName: "Changed" } });
    await db.person.update({ where: { id: owner.personId }, data: { firstName: "Sample" } });
    assert.equal((await db.person.findUnique({ where: { id: owner.personId } })).identityRevision, 3);
    assert.equal((await reviews.status(owner.id)).identityVerified, false);
    assert.equal(await seesPost("for-you"), false);
    assert.deepEqual((await savedFeed()).items, []);
    assert.equal(await republished("for-you"), undefined);
    await assert.rejects(like(true), { status: 404 });
    await assert.rejects(posts.memberPublish(actor, { ...draft, requestKey: randomUUID() }), { status: 403 });
    assert.deepEqual(await repost(false), { reposted: false });
    assert.deepEqual(await repost(false), { reposted: false });
    assert.equal(await db.postRepost.count({ where: { id: repostId } }), 0);
    await posts.memberWithdraw(actor, postId);
    await posts.memberWithdraw(actor, postId);
    assert.equal((await posts.memberList(actor, {})).items.length, 0);
    await reviews.submit(owner.id, await submission());
    assert.equal(await db.manualIdentityAttempt.count({ where: { requestId } }), 2);
    await db.managementStaff.update({ where: { id: reviewer.id }, data: { capabilities: [] } });
    await assert.rejects(reviews.detail(reviewer.id, session.id, requestId), { status: 403 });
    await db.manualIdentityAudit.updateMany({ where: { requestId, action: "DECIDED" }, data: { note: "Legacy private decision feedback" } });
    date = new Date(+date + 31 * 86400000);
    await reviews.cleanup();
    assert.equal((await reviews.owner(owner.id)).status, "EXPIRED");
    assert.equal(await db.manualIdentityEvidence.count({ where: { accountId: owner.id, state: "ATTACHED" } }), 0);
    const attempts = await db.manualIdentityAttempt.findMany({ where: { requestId } });
    assert(attempts.every((row) => row.snapshot === null && row.note === null && row.purgedAt));
    assert.equal(await db.manualIdentityAudit.count({ where: { requestId, note: { not: null } } }), 0);
    assert.equal(await db.manualIdentityAudit.count({ where: { requestId, action: "DECIDED" } }), 1);
    // Prisma's @updatedAt uses wall-clock time. Align only these synthetic rows
    // with the injected test clock before exercising the deletion grace period.
    await db.manualIdentityEvidence.updateMany({ where: { accountId: owner.id, state: "DELETE_PENDING" }, data: { updatedAt: date } });
    assert.deepEqual(await uploads.cleanup(), { deleted: 0, failed: 0 });
    assert.equal(objects.size, 4);
    date = new Date(+date + 11 * 60000);
    assert.deepEqual(await uploads.cleanup(), { deleted: 4, failed: 0 });
    assert.equal(objects.size, 0);
    assert.equal(await db.manualIdentityEvidence.count({ where: { accountId: owner.id, state: "DELETED" } }), 4);
    assert.deepEqual(await uploads.cleanup(), { deleted: 0, failed: 0 });
    assert.equal(await db.manualIdentityAudit.count({ where: { requestId, action: "DECIDED" } }), 1);
  } finally {
    try {
      const ids = accounts.map((a) => a.id), people = accounts.map((a) => a.personId).filter(Boolean);
      const requests = await db.manualIdentityRequest.findMany({ where: { accountId: { in: ids } }, select: { id: true } });
      const requestIds = requests.map((r) => r.id);
      await db.memberPost.deleteMany({ where: { authorId: { in: ids } } });
      if (organization) {
        await db.organizationPost.deleteMany({ where: { organizationId: organization.id } });
        await clearOrganizationProfiles(db, [organization.id]);
        await db.organization.delete({ where: { id: organization.id } });
      }
      if (organizationRequest) await db.organizationRequest.delete({ where: { id: organizationRequest.id } });
      await db.networkFollow.deleteMany({ where: { followerId: { in: ids } } });
      await db.networkPair.deleteMany({ where: { leftAccountId: { in: ids } } });
      await db.manualIdentityEvidence.deleteMany({ where: { accountId: { in: ids } } });
      await db.manualIdentityAudit.deleteMany({ where: { targetAccountId: { in: ids } } });
      await db.manualIdentityAttempt.deleteMany({ where: { requestId: { in: requestIds } } });
      await db.manualIdentityRequest.deleteMany({ where: { id: { in: requestIds } } });
      await db.manualIdentityUploadBudget.deleteMany({ where: { accountId: { in: ids } } });
      await db.managementAction.deleteMany({ where: { actorId: { in: ids } } });
      await cleanupManagementFixtures(db, ids);
      await db.manualIdentityReviewer.deleteMany({ where: { accountId: { in: ids } } });
      await db.session.deleteMany({ where: { accountId: { in: ids } } });
      await db.mfaFactor.deleteMany({ where: { accountId: { in: ids } } });
      await db.profile.deleteMany({ where: { personId: { in: people } } });
      if (photo) await db.photoAsset.delete({ where: { id: photo.id } });
      await db.account.deleteMany({ where: { id: { in: ids } } });
      await db.person.deleteMany({ where: { id: { in: people } } });
    } finally { await db.$disconnect(); }
  }
});
