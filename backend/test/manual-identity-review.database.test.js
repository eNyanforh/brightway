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
    accounts.push(await managementStaffFixture(db, { username: `reviewer_${marker.replaceAll("-", "").slice(0, 12)}`, email: `reviewer_${marker}@example.invalid` }, ["identity-reviewer", "moderation-agent"], date));
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
    const [publication, retry] = await Promise.all([posts.memberPublish(actor, draft), posts.memberPublish(actor, draft)]);
    const moderator = { staffId: reviewer.id, sessionId: session.id };
    async function approvePost(id) {
      const row = await db.memberPost.findUniqueOrThrow({ where: { id }, select: { moderationVersion: true } });
      return moderation.decide(moderator, id, { decision: "PUBLISHED", expectedVersion: row.moderationVersion, requestKey: randomUUID(), reason: "Submission follows BrightWay educational publishing standards." });
    }
    assert.equal(publication.post.moderationStatus, "PUBLISHED");
    assert.equal(publication.post.moderationNotice, null);
    const postId = publication.post.id;
    assert.equal(retry.post.id, postId);
    assert.equal(publication.post.type, "POST");
    assert.deepEqual(publication.post.tags, ["Learning Journeys"]);
    assert.deepEqual(publication.post.member, { username: owner.username, name: "Sample owner", photoId: photo.id, verified: true });
    assert.deepEqual(Object.keys(publication.post).sort(), ["body", "createdAt", "eventDetails", "id", "member", "moderationFeedback", "moderationNotice", "moderationStatus", "moderationVersion", "questionDetails", "tags", "type"].sort());
    assert.equal(publication.post.eventDetails, null);
    assert.equal(publication.post.questionDetails, null);
    await assert.rejects(posts.memberPublish(actor, { ...draft, body: "Different content" }), { status: 409 });
    await assert.rejects(posts.memberPublish(actor, { ...draft, type: "EVENT", eventDetails: { title: "Learning meetup", startAt: "2027-01-15T12:00:00Z", endAt: "2027-01-15T14:00:00Z", timezone: "UTC", format: "IN_PERSON", venue: "Campus hall", coverTheme: "NAVY" } }), { status: 409 });
    await assert.rejects(posts.memberPublish(actor, { ...draft, tags: ["Skills"] }), { status: 409 });
    await assert.rejects(posts.memberPublish(actor, { body: draft.body, requestKey: randomUUID() }), { status: 400, message: "Add at least one topic tag before publishing." });
    await assert.rejects(posts.memberPublish(actor, { ...draft, tags: ["Research", "#research"], requestKey: randomUUID() }), { status: 400 });
    await assert.rejects(posts.memberPublish(actor, { ...draft, tags: ["One", "Two", "Three", "Four", "Five", "Six"], requestKey: randomUUID() }), { status: 400 });
    await assert.rejects(posts.memberPublish(actor, { ...draft, type: "OPPORTUNITY", requestKey: randomUUID() }), { status: 400 });
    const viewer = await db.account.create({ data: {
      username: `viewer_${marker}`, email: `viewer_${marker}@example.invalid`, passwordHash,
      person: { create: { firstName: "Synthetic", lastName: "Viewer" } },
    } });
    accounts.push(viewer);
    const viewerSession = await db.session.create({ data: { accountId: viewer.id, tokenHash: randomUUID(), expiresAt: new Date(+date + 7 * 86400000) } });
    const viewerActor = { accountId: viewer.id, sessionId: viewerSession.id };
    assert.ok((await moderation.list(moderator, { status: "PUBLISHED" })).items.some(item => item.id === postId));
    assert.equal((await posts.memberList(actor, {})).items.find(item => item.id === postId)?.moderationStatus, "PUBLISHED");
    assert.deepEqual((await posts.memberList(actor, {})).items.find(item => item.id === postId)?.moderationNotice,
      publication.post.moderationNotice, "the reason persists on the private My Posts endpoint");
    assert.equal((await posts.feed(viewerActor, {})).items.some(item => item.id === postId), true);
    assert.equal((await posts.readPost(viewerActor, "member", postId)).post.id, postId);
    assert.deepEqual(await posts.memberPhoto(viewerActor, owner.username, photo.id), { personId: owner.personId, photoId: photo.id });
    await assert.rejects(posts.memberPhoto(viewerActor, owner.username, randomUUID()), { status: 404 });
    for (const type of ["ACHIEVEMENT", "EVENT", "QUESTION"]) {
      const details = {
        title: "Student Research Workshop", startAt: "2027-01-15T12:00:00Z", endAt: "2027-01-15T14:00:00Z",
        timezone: "UTC", format: "HYBRID", venue: "University campus",
        meetingUrl: "https://meet.example.org/student-research", coverTheme: "FOREST",
      };
      const typedDraft = { body: "A member update.", requestKey: randomUUID(), type, tags: ["Research", "Community"],
        ...(type === "EVENT" ? { eventDetails: details } : {}),
        ...(type === "QUESTION" ? { questionDetails: { title: "How do I plan my first research project?", intent: "GUIDANCE" } } : {}),
      };
      const { post } = await posts.memberPublish(actor, typedDraft);
      assert.equal(post.type, type);
      assert.deepEqual(post.tags, typedDraft.tags);
      if (type === "EVENT") assert.deepEqual(post.eventDetails, { ...details,
        venue: "University campus", meetingUrl: "https://meet.example.org/student-research",
        ticketPriceCents: 0, currency: "USD", requiresApproval: false, capacity: null });
      if (type === "QUESTION") assert.deepEqual(post.questionDetails, typedDraft.questionDetails);
      assert.deepEqual(await posts.memberPublish(actor, typedDraft), { post });
      assert.equal(post.moderationStatus, "PUBLISHED");
      assert.equal((await posts.feed(viewerActor, {})).items.some(item => item.id === post.id), true);
      const owned = (await posts.memberList(actor, {})).items.find(item => item.id === post.id);
      const visible = (await posts.feed(viewerActor, {})).items.find(item => item.id === post.id);
      assert.equal(owned?.type, type);
      assert.equal(visible?.type, type);
      assert.equal(visible?.member?.verified, true, "Approved public authors show their verified badge in Explore.");
      assert.equal(owned?.member?.verified, true, "Approved publishers retain the badge in My Posts.");
      assert.deepEqual(owned?.tags, typedDraft.tags);
      assert.deepEqual(visible?.tags, typedDraft.tags);
      if (type === "EVENT") assert.deepEqual(visible?.eventDetails, post.eventDetails);
      if (type === "QUESTION") assert.deepEqual(visible?.questionDetails, typedDraft.questionDetails);
      assert.equal((await posts.recordView(viewerActor, "member", post.id)).views, 1);
      assert.equal((await posts.recordView(viewerActor, "member", post.id)).views, 1, "Repeat views cannot inflate counts.");
      assert.equal((await posts.recordView(actor, "member", post.id)).views, 1, "Self-views are excluded.");
      if (type === "ACHIEVEMENT") {
        assert.deepEqual(await posts.setLike(viewerActor, "member", post.id, { liked: true }), { reaction: { liked: true, count: 1 } });
      } else {
        await assert.rejects(posts.setLike(viewerActor, "member", post.id, { liked: true }), { status: 400 });
      }
      if (type === "EVENT") {
        const publicAttendee = { username: owner.username, name: "Sample owner", photoId: photo.id, verified: true };
        // Registration totals include private/unverified registrants; avatars must not.
        assert.deepEqual(await posts.registerEvent(viewerActor, post.id, { registered: true }),
          { registration: { registered: true, status: "APPROVED", count: 1 }, eventAttendees: [] });
        assert.deepEqual(await posts.registerEvent(viewerActor, post.id, { registered: true }),
          { registration: { registered: true, status: "APPROVED", count: 1 }, eventAttendees: [] });
        let eventInFeed = (await posts.feed(viewerActor, {})).items.find(item => item.id === post.id);
        assert.equal(eventInFeed?.registration?.registered, true);
        assert.equal(eventInFeed?.registration?.count, 1);
        assert.deepEqual(eventInFeed?.eventAttendees, []);
        const ownerRegistration = await posts.registerEvent(actor, post.id, { registered: true });
        assert.deepEqual(ownerRegistration, {
          registration: { registered: true, status: "APPROVED", count: 2 }, eventAttendees: [publicAttendee],
        });
        eventInFeed = (await posts.feed(viewerActor, {})).items.find(item => item.id === post.id);
        assert.equal(eventInFeed?.registration?.count, 2);
        assert.deepEqual(eventInFeed?.eventAttendees, [publicAttendee]);
        assert.deepEqual((await posts.readPost(viewerActor, "member", post.id)).post.eventAttendees, [publicAttendee]);
        assert.deepEqual(await posts.registerEvent(actor, post.id, { registered: false }),
          { registration: { registered: false, status: null, count: 1 }, eventAttendees: [] });
        assert.deepEqual(await posts.registerEvent(viewerActor, post.id, { registered: false }),
          { registration: { registered: false, status: null, count: 0 }, eventAttendees: [] });
      }
      if (type === "QUESTION") {
        await assert.rejects(posts.setReposted(viewerActor, "member", post.id, { reposted: true }), { status: 400 });
        await assert.rejects(posts.reportQuestion(actor, post.id, { reason: "SPAM" }), { status: 400 });
        assert.deepEqual(await posts.reportQuestion(viewerActor, post.id, { reason: "SPAM" }), { reported: true });
        assert.deepEqual(await posts.reportQuestion(viewerActor, post.id, { reason: "SPAM" }), { reported: true });
        const answerDraft = { body: "Start with the research question and a realistic plan.", requestKey: randomUUID() };
        await assert.rejects(posts.addAnswer(actor, post.id, answerDraft), { status: 403 },
          "the question publisher may review and comment on answers but cannot answer");
        assert.equal(await db.questionAnswer.count({ where: { questionId: post.id } }), 0);
        // Seed an answer from another participant to cover voting and the
        // publisher's ability to comment without granting self-answer permission.
        const answer = await db.questionAnswer.create({ data: {
          questionId: post.id, authorId: viewer.id,
          requestKey: randomUUID(), body: answerDraft.body,
        } });
        const visibleAnswer = (await posts.answers(actor, post.id, { sort: "top" })).items[0];
        assert.equal(visibleAnswer.id, answer.id);
        assert.equal(visibleAnswer.username, viewer.username);
        assert.equal(visibleAnswer.verified, undefined);
        assert.deepEqual([visibleAnswer.upvoteCount, visibleAnswer.downvoteCount], [0, 0]);
        assert.deepEqual(await posts.voteAnswer(actor, answer.id, { value: 1 }),
          { score: 1, myVote: 1, upvoteCount: 1, downvoteCount: 0 });
        assert.deepEqual(await posts.voteAnswer(actor, answer.id, { value: 1 }),
          { score: 1, myVote: 1, upvoteCount: 1, downvoteCount: 0 });
        assert.deepEqual(await posts.voteAnswer(actor, answer.id, { value: -1 }),
          { score: -1, myVote: -1, upvoteCount: 0, downvoteCount: 1 });
        assert.deepEqual(await posts.voteAnswer(actor, answer.id, { value: 0 }),
          { score: 0, myVote: 0, upvoteCount: 0, downvoteCount: 0 });
        await assert.rejects(posts.voteAnswer(viewerActor, answer.id, { value: 1 }), { status: 400 });
        const { comment } = await posts.addAnswerComment(viewerActor, answer.id,
          { body: "Can you give an example?", requestKey: randomUUID() });
        assert.equal((await posts.answerComments(actor, answer.id)).items[0].id, comment.id);
        assert.equal((await posts.answerComments(actor, answer.id)).items[0].verified, undefined);
        const { comment: ownerReply } = await posts.addAnswerComment(actor, answer.id,
          { body: "Here is an example.", requestKey: randomUUID() });
        assert.deepEqual([ownerReply.name, ownerReply.photoId, ownerReply.verified], ["Sample owner", photo.id, true]);
        const visibleOwnerReply = (await posts.answerComments(viewerActor, answer.id)).items.find(row => row.id === ownerReply.id);
        assert.deepEqual([visibleOwnerReply.name, visibleOwnerReply.photoId, visibleOwnerReply.verified],
          ["Sample owner", photo.id, true]);
        await posts.deleteAnswerComment(actor, answer.id, ownerReply.id);
        await posts.deleteAnswerComment(viewerActor, answer.id, comment.id);
        assert.equal((await posts.answerComments(actor, answer.id)).items.length, 0);
        await posts.deleteAnswer(viewerActor, answer.id);
        await assert.rejects(posts.voteAnswer(viewerActor, answer.id, { value: 1 }), { status: 404 });
      }
      await posts.memberWithdraw(actor, post.id);
    }
    const rejectedDraft = { body: "An unfinished career achievement description.", type: "ACHIEVEMENT", tags: ["Careers"], requestKey: randomUUID() };
    const { post: rejection } = await posts.memberPublish(actor, rejectedDraft);
    const decisionBase = { expectedVersion: rejection.moderationVersion, requestKey: randomUUID(), reason: "Please explain the learning milestone and correct the incomplete description." };
    const rejectionResult = await moderation.decide(moderator, rejection.id, { ...decisionBase, decision: "REJECTED" });
    assert.equal(rejectionResult.moderationStatus, "REJECTED");
    const rejectedOwnerPost = (await posts.memberList(actor, {})).items.find(item => item.id === rejection.id);
    assert.equal(rejectedOwnerPost.moderationNotice.code, "MANAGEMENT_DECLINED");
    assert.equal(rejectedOwnerPost.moderationNotice.reasons[0], decisionBase.reason);
    assert.deepEqual(await moderation.decide(moderator, rejection.id, { ...decisionBase, decision: "REJECTED" }), rejectionResult,
      "same decision key is an idempotent replay");
    assert.equal((await posts.memberList(actor, {})).items.find(item => item.id === rejection.id).moderationFeedback, decisionBase.reason);
    await assert.rejects(posts.readPost(viewerActor, "member", rejection.id), { status: 404 });
    const { post: revised } = await posts.memberEdit(actor, rejection.id, {
      expectedBody: rejection.body, expectedTags: rejection.tags,
      body: "I built a student learning portfolio and published its source code.",
      tags: ["Careers", "Coding"],
    });
    assert.equal(revised.moderationStatus, "PENDING");
    assert.ok(revised.moderationNotice?.reasons.length > 0);
    assert.equal(revised.moderationVersion, rejection.moderationVersion + 2);
    assert.equal(revised.moderationFeedback, null);
    await assert.rejects(moderation.decide(moderator, rejection.id, {
      decision: "PUBLISHED", expectedVersion: rejection.moderationVersion,
      requestKey: randomUUID(), reason: "The revision is appropriate for publication.",
    }), { status: 409 }, "stale revisions cannot approve changed content");
    await approvePost(rejection.id);
    assert.equal((await posts.readPost(viewerActor, "member", rejection.id)).post.id, rejection.id);
    // A published post remains subject to Management removal and restoration.
    const beforeRemoval = await db.memberPost.findUniqueOrThrow({ where: { id: rejection.id } });
    const removed = await moderation.decide(moderator, rejection.id, {
      decision: "REJECTED", expectedVersion: beforeRemoval.moderationVersion,
      requestKey: randomUUID(), reason: "This public post needs correction following Management review.",
    });
    assert.equal(removed.moderationStatus, "REJECTED");
    assert.equal(removed.moderationVersion, beforeRemoval.moderationVersion + 1);
    assert.equal((await moderation.list(moderator, { status: "REJECTED" })).items.some(row => row.id === rejection.id), true);
    await assert.rejects(posts.readPost(viewerActor, "member", rejection.id), { status: 404 });
    await assert.rejects(moderation.decide(moderator, rejection.id, {
      decision: "PUBLISHED", expectedVersion: beforeRemoval.moderationVersion,
      requestKey: randomUUID(), reason: "A stale moderator action should not restore this post.",
    }), { status: 409 });
    const restored = await moderation.decide(moderator, rejection.id, {
      decision: "PUBLISHED", expectedVersion: removed.moderationVersion,
      requestKey: randomUUID(), reason: "The post is suitable for publication after management review.",
    });
    assert.equal(restored.moderationStatus, "PUBLISHED");
    assert.equal((await moderation.list(moderator, { status: "PUBLISHED" })).items.some(row => row.id === rejection.id), true);
    assert.equal((await posts.readPost(viewerActor, "member", rejection.id)).post.id, rejection.id);
    await posts.memberWithdraw(actor, rejection.id);

    // Automatic publishing must not depend on AI configuration or network providers.
    const publicationDraft = { body: "I finished a university software engineering project and shared what I learned.",
      type: "ACHIEVEMENT", tags: ["Coding"], requestKey: randomUUID() };
    const { post: autoPublished } = await posts.memberPublish(actor, publicationDraft);
    assert.equal(autoPublished.moderationStatus, "PUBLISHED");
    assert.equal(autoPublished.moderationNotice, null);
    assert.equal((await posts.readPost(viewerActor, "member", autoPublished.id)).post.id, autoPublished.id);
    assert.equal((await moderation.list(moderator, { status: "PUBLISHED" })).items.some(row => row.id === autoPublished.id), true);
    // A published post edit remains visible immediately without AI screening.
    const { post: regularEdit } = await posts.memberEdit(actor, autoPublished.id, {
      expectedBody: autoPublished.body, expectedTags: autoPublished.tags,
      body: "I completed my university software engineering project and shared the lessons.",
      tags: ["Coding"],
    });
    assert.equal(regularEdit.moderationStatus, "PUBLISHED");
    assert.equal((await posts.readPost(viewerActor, "member", autoPublished.id)).post.body, regularEdit.body);
    // Human takedowns cannot be bypassed by editing a removed post.
    const down = await moderation.decide(moderator, autoPublished.id, {
      decision: "REJECTED", expectedVersion: regularEdit.moderationVersion,
      requestKey: randomUUID(), reason: "A moderator found a misleading claim requiring clarification.",
    });
    assert.equal(down.moderationStatus, "REJECTED");
    const { post: editAfterRemoval } = await posts.memberEdit(actor, autoPublished.id, {
      expectedBody: regularEdit.body, expectedTags: regularEdit.tags,
      body: "I completed a university software engineering project and explained the tests.",
      tags: ["Coding"],
    });
    assert.equal(editAfterRemoval.moderationStatus, "PENDING");
    assert.equal(editAfterRemoval.moderationNotice.code, "MANUAL_REVIEW");
    await assert.rejects(posts.readPost(viewerActor, "member", autoPublished.id), { status: 404 });
    await approvePost(autoPublished.id);
    await posts.memberWithdraw(actor, autoPublished.id);

    // Existing legacy PENDING posts remain private until the author edits them or staff approves.
    const historicPending = await db.memberPost.create({ data: {
      authorId: owner.id, requestKey: randomUUID(), body: "A legacy draft awaiting review.",
      type: "ACHIEVEMENT", tags: ["Learning"], moderationStatus: "PENDING", createdAt: date,
    } });
    const ownerPending = (await posts.memberList(actor, {})).items.find(row => row.id === historicPending.id);
    assert.equal(ownerPending.moderationNotice.code, "MANUAL_REVIEW");
    await assert.rejects(posts.readPost(viewerActor, "member", historicPending.id), { status: 404 });
    const { post: revisedHistoric } = await posts.memberEdit(actor, historicPending.id, {
      expectedBody: historicPending.body, expectedTags: historicPending.tags,
      body: "I have updated my learning achievement.", tags: ["Learning"],
    });
    assert.equal(revisedHistoric.moderationStatus, "PUBLISHED");
    assert.equal((await posts.readPost(viewerActor, "member", historicPending.id)).post.id, historicPending.id);
    await posts.memberWithdraw(actor, historicPending.id);

    const controlledEvent = {
      title: "Host-approved workshop", startAt: "2027-01-15T12:00:00Z",
      endAt: "2027-01-15T14:00:00Z", timezone: "UTC", format: "ONLINE",
      meetingUrl: "https://meet.example.org/approved-only", coverTheme: "NAVY",
      ticketPriceCents: 2500, currency: "USD", requiresApproval: true, capacity: 1,
    };
    const { post: restricted } = await posts.memberPublish(actor, {
      body: "Limited-seat approval workshop.", requestKey: randomUUID(),
      type: "EVENT", tags: ["Education"], eventDetails: controlledEvent,
    });
    const pending = await posts.registerEvent(viewerActor, restricted.id, { registered: true });
    assert.deepEqual(pending, {
      registration: { registered: false, status: "PENDING", count: 0 },
      eventAttendees: [],
    });
    assert.deepEqual(await posts.registerEvent(viewerActor, restricted.id, { registered: true }), pending);
    assert.equal((await posts.feed(viewerActor, {})).items.find(row => row.id === restricted.id)
      ?.eventDetails.meetingUrl, "", "An unapproved viewer cannot retrieve the meeting link.");
    assert.equal((await posts.readPost(viewerActor, "member", restricted.id)).post.eventDetails.meetingUrl, "");
    assert.equal((await posts.readPost(actor, "member", restricted.id)).post.eventDetails.meetingUrl,
      controlledEvent.meetingUrl);
    await assert.rejects(posts.eventRequests(viewerActor, restricted.id), { status: 403 });
    const review = await posts.eventRequests(actor, restricted.id);
    assert.equal(review.pendingCount, 1);
    assert.equal(review.items.length, 1);
    assert.equal(review.items[0].username, viewer.username);
    assert.equal(review.items[0].name, undefined, "Private applicant names must not be exposed.");
    await assert.rejects(posts.decideEventRequest(viewerActor, restricted.id, review.items[0].id,
      { approved: true }), { status: 403 });
    const eventDecision = await posts.decideEventRequest(actor, restricted.id, review.items[0].id,
      { approved: true });
    assert.deepEqual(eventDecision, {
      registration: { registered: false, status: null, count: 1 },
      eventAttendees: [], pendingCount: 0,
    });
    await assert.rejects(posts.decideEventRequest(actor, restricted.id, review.items[0].id,
      { approved: true }), { status: 404 });
    const confirmed = (await posts.feed(viewerActor, {})).items.find(row => row.id === restricted.id);
    assert.deepEqual(confirmed.registration,
      { registered: true, status: "APPROVED", count: 1 });
    assert.equal(confirmed.eventDetails.meetingUrl, controlledEvent.meetingUrl);
    await assert.rejects(posts.registerEvent(actor, restricted.id, { registered: true }),
      { status: 409, message: "This event has reached its capacity." });
    assert.deepEqual(await posts.registerEvent(viewerActor, restricted.id, { registered: false }),
      { registration: { registered: false, status: null, count: 0 }, eventAttendees: [] });
    assert.equal((await posts.feed(viewerActor, {})).items.find(row => row.id === restricted.id)
      .eventDetails.meetingUrl, "");

    const { post: declinedEvent } = await posts.memberPublish(actor, {
      body: "Separate approval decisions.", requestKey: randomUUID(), type: "EVENT",
      tags: ["Education"], eventDetails: { ...controlledEvent, title: "Approval decisions", capacity: 3 },
    });
    await posts.registerEvent(viewerActor, declinedEvent.id, { registered: true });
    const reviewToDecline = await posts.eventRequests(actor, declinedEvent.id);
    const rejected = await posts.decideEventRequest(actor, declinedEvent.id, reviewToDecline.items[0].id,
      { approved: false });
    assert.equal(rejected.registration.count, 0);
    assert.equal(rejected.pendingCount, 0);
    assert.equal((await posts.feed(viewerActor, {})).items.find(row => row.id === declinedEvent.id)
      .registration.status, "REJECTED");
    assert.equal((await posts.registerEvent(viewerActor, declinedEvent.id, { registered: true }))
      .registration.status, "PENDING", "A declined guest may submit a new request.");
    assert.equal((await posts.registerEvent(viewerActor, declinedEvent.id, { registered: false }))
      .registration.status, null);

    // Do not let additional admission fixtures alter later pagination expectations.
    await posts.memberWithdraw(actor, restricted.id);
    await posts.memberWithdraw(actor, declinedEvent.id);

    for (const invalid of [
      { ...controlledEvent, ticketPriceCents: -10 },
      { ...controlledEvent, ticketPriceCents: 1.5 },
      { ...controlledEvent, currency: "EUR" },
      { ...controlledEvent, capacity: 0 },
      { ...controlledEvent, capacity: 100_001 },
      { ...controlledEvent, requiresApproval: "yes" },
    ]) {
      await assert.rejects(posts.memberPublish(actor, {
        body: "Invalid admission settings.", type: "EVENT", tags: ["Education"],
        requestKey: randomUUID(), eventDetails: invalid,
      }), { status: 400 });
    }
    await assert.rejects(posts.memberPublish(actor, {
      body: "Invalid event.", requestKey: randomUUID(), type: "EVENT", tags: ["Research"],
      eventDetails: { title: "Invalid event", startAt: "2027-01-15T14:00:00Z", endAt: "2027-01-15T12:00:00Z",
        timezone: "UTC", format: "ONLINE", meetingUrl: "https://meet.example.org/room", coverTheme: "NAVY" },
    }), { status: 400 });
    await assert.rejects(posts.memberPublish(actor, {
      body: "Some details", requestKey: randomUUID(), type: "QUESTION", tags: ["Research"],
    }), { status: 400 });
    await assert.rejects(posts.memberPublish(actor, {
      body: "Some details", requestKey: randomUUID(), type: "QUESTION", tags: ["Research"],
      questionDetails: { title: "Short", intent: "GUIDANCE" },
    }), { status: 400 });
    await assert.rejects(posts.memberPublish(actor, {
      body: "Some details", requestKey: randomUUID(), type: "ACHIEVEMENT", tags: ["Research"],
      questionDetails: { title: "How do I plan a research project?", intent: "GUIDANCE" },
    }), { status: 400 });
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
    const { comment: ownerComment } = await posts.addComment(actor, "member", postId,
      { body: "A verified contributor reply.", requestKey: randomUUID() });
    assert.deepEqual([ownerComment.name, ownerComment.photoId, ownerComment.verified],
      ["Sample owner", photo.id, true]);
    const readOwnerComment = (await commentsAsViewer()).items.find(row => row.id === ownerComment.id);
    assert.deepEqual([readOwnerComment.name, readOwnerComment.photoId, readOwnerComment.verified],
      ["Sample owner", photo.id, true]);
    await posts.deleteComment(actor, "member", postId, ownerComment.id);
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
      id: randomUUID(), authorId: owner.id, requestKey: randomUUID(), body: `Synthetic post ${index}`, createdAt: date,
    }));
    await db.memberPost.createMany({ data: extraPosts.map(row => ({ ...row, moderationStatus: "PUBLISHED" })) });
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
    assert.equal(copy.repost.member.verified, true, "Approved reposters are visibly verified.");
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
    await assert.rejects(posts.memberPhoto(viewerActor, owner.username, photo.id), { status: 404 });
    assert.equal(await seesPost("for-you"), false);
    assert.equal(await seesPost("following"), false);
    await assert.rejects(like(true), { status: 404 });
    assert.equal(await republished("for-you"), undefined);
    await db.networkPair.delete({ where: { id: block.id } });
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
      // Synthetic post-review decisions create durable ManagementAction rows.
      // Remove only this fixture reviewer’s test audit entries before deleting staff.
      if (accounts[1]) await db.managementAction.deleteMany({ where: { actorId: accounts[1].id, targetType: "MEMBER_POST" } });
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
