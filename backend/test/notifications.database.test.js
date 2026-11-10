import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { tokenHash } from "../src/modules/auth/session.service.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const origin = "http://localhost:5173";

test("the real app exposes member profiles by default and preserves inbox ownership, contact privacy and block cleanup", {
  skip: !testDatabaseUrl && "Set TEST_DATABASE_URL to a separate migrated test database",
}, async () => {
  process.env.NODE_ENV = "test";
  process.env.CLIENT_URL = origin;
  process.env.DATABASE_URL = testDatabaseUrl;
  const { default: app } = await import("../src/app.js");
  const { prisma } = await import("../src/config/database.js");
  const accounts = [];
  const createdCredentials = [];
  const createdPosts = [];
  const createdPhotos = [];
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port + "/api/v1";

  async function account(label) {
    const marker = randomUUID().slice(0, 8);
    const row = await prisma.account.create({ data: {
      username: "view_" + label + "_" + marker,
      email: label + "_" + marker + "@example.invalid",
      passwordHash: "synthetic-unusable-hash",
      person: { create: { firstName: "Synthetic", lastName: label, phoneNumber: "+231770000000" } },
    } });
    accounts.push(row);
    const token = randomBytes(32).toString("hex");
    const session = await prisma.session.create({ data: {
      accountId: row.id,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + 86400000),
    } });
    return { ...row, cookie: "brightway_session=" + token, sessionId: session.id, version: 0 };
  }

  async function request(actor, path, { method = "GET", body, status = 200, requestOrigin = origin } = {}) {
    const headers = actor ? { Cookie: actor.cookie } : {};
    if (body !== undefined) Object.assign(headers, { "Content-Type": "application/json", Origin: requestOrigin });
    const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    assert.equal(response.status, status, method + " " + path);
    return (await response.json()).data;
  }

  async function preferences(actor, changes) {
    const { profile } = await request(actor, "/profile/me", {
      method: "PATCH", body: { expectedVersion: actor.version, changes },
    });
    actor.version = profile.version;
    return profile;
  }

  const view = (viewer, target, options) => request(viewer, "/profiles/" + target.username + "/view", { method: "POST", body: {}, ...options });
  const inbox = actor => request(actor, "/notifications");
  const dashboard = actor => request(actor, "/profile/me/dashboard");
  const post = (actor, path, body = {}) => request(actor, path, { method: "POST", body });

  try {
    const owner = await account("owner");
    const visitor = await account("visitor");
    const other = await account("other");
    await view(visitor, owner, { status: 404 });
    await request(null, "/profile/me/dashboard", { status: 401 });
    await preferences(owner, { headline: "Published fixture" });
    assert.deepEqual(((stats) => [stats.profileViews, stats.postImpressions, stats.searchAppearances])(await dashboard(owner)), [0, 0, 0]);
    const search = (actor, q, options = {}, status = 200) =>
      request(actor, "/search?" + new URLSearchParams({ q, kind: "people", ...options }), { status });
    await search(null, owner.username, {}, 401);
    await search(visitor, "!!", {}, 400);
    const hit = { kind: "people", name: "Synthetic owner", username: owner.username, href: "/" + owner.username };
    assert.deepEqual(await search(visitor, "synt own"), { items: [hit], nextCursor: null });
    assert.deepEqual((await search(visitor, "@" + owner.username)).items, [hit]);
    const searchStats = await dashboard(owner);
    assert.equal(searchStats.searchAppearances, 1, "repeated searches from one member count once per UTC day");
    assert.deepEqual(searchStats.recentProfileViewers, [], "directory searches never expose searchers");
    assert.equal(Object.hasOwn(searchStats, "searcherAvatars"), false);
    assert.equal(searchStats.profileViews, 0, "directory appearances are not profile views");
    assert.equal(Object.hasOwn(searchStats, "viewerId"), false);
    assert.deepEqual((await search(owner, owner.username)).items, []);
    assert.ok((await search(visitor, other.username)).items.some(item => item.username === other.username));
    assert.deepEqual((await search(visitor, owner.email)).items, []);
    assert.deepEqual((await search(visitor, "x') OR 1=1 --")).items, []);

    const batch = randomUUID().replaceAll("-", "").slice(0, 8);
    for (let i = 0; i < 22; i++) {
      const row = await prisma.account.create({ data: {
        username: `search_${batch}_${String(i).padStart(2, "0")}`,
        email: `search_${batch}_${i}@example.invalid`, passwordHash: "synthetic-unusable-hash",
        person: { create: { firstName: "Directory", lastName: batch } },
      } });
      accounts.push(row);
    }
    const firstPage = await search(visitor, "Directory " + batch);
    assert.equal(firstPage.items.length, 20);
    assert.ok(firstPage.nextCursor);
    await search(owner, "Directory " + batch, { cursor: firstPage.nextCursor }, 400);
    await search(visitor, "Directory", { cursor: firstPage.nextCursor }, 400);
    const nextPage = await search(visitor, "Directory " + batch, { cursor: firstPage.nextCursor });
    assert.equal(nextPage.nextCursor, null);
    assert.deepEqual([...firstPage.items, ...nextPage.items].map(item => item.username),
      Array.from({ length: 22 }, (_, i) => `search_${batch}_${String(i).padStart(2, "0")}`));
    await view(null, owner, { status: 401 });
    await view(visitor, owner, { requestOrigin: "https://foreign.invalid", status: 403 });

    const photo = await prisma.photoAsset.create({ data: {
      personId: owner.personId, storageKey: "test/portrait-" + randomUUID() + ".webp",
      state: "CLAIMED", expiresAt: new Date(Date.now() + 86400000),
    } });
    createdPhotos.push(photo.id);
    await prisma.profile.update({ where: { personId: owner.personId }, data: { photoId: photo.id } });
    const profile = await view(visitor, owner);
    assert.equal(profile.headline, "Published fixture");
    assert.equal(profile.photoId, photo.id, "current portrait appears without identity verification");
    const { createOrganizationPosts } = await import("../src/modules/posts/organization-posts.service.js");
    const posts = createOrganizationPosts({ prisma });
    assert.deepEqual(await posts.memberPhoto(
      { accountId: visitor.id, sessionId: visitor.sessionId }, owner.username, photo.id,
    ), { personId: owner.personId, photoId: photo.id },
    "the current portrait is visible without badge approval");
    assert.equal((await view(owner, owner)).photoId, photo.id, "the owner can open their public profile");
    assert.equal((await dashboard(owner)).profileViews, 1, "self-view never creates a visitor entry");
    await view(visitor, owner);
    assert.equal((await dashboard(owner)).profileViews, 1, "repeated public visits from one member count once per UTC day");
    assert.deepEqual((await dashboard(owner)).recentProfileViewers, [{
      username: visitor.username, name: "Synthetic visitor", photoId: null,
    }], "recent, unblocked visitors appear without a profile-sharing toggle");
    assert.equal((await dashboard(visitor)).profileViews, 0, "visits belong to the profile owner only");
    for (const field of ["contact", "email", "phoneNumber", "education", "experience"]) {
      assert.equal(Object.hasOwn(profile, field), false, field);
    }
    assert.equal((await inbox(owner)).items.length, 1);

    // Certifications and verified credentials are visible without separate switches.
    const certificate = { title: "Data Analysis Certificate", issuer: "Training Center",
      issuedMonth: "2026-08", expiresMonth: null,
      credentialUrl: "https://certificates.example.org/abc" };
    await preferences(owner, { certifications: [certificate] });
    assert.deepEqual((await view(visitor, owner)).certifications, [{ ...certificate, verified: false }]);
    const ownerProfile = await prisma.profile.findUnique({
      where: { personId: owner.personId }, select: { id: true },
    });
    const education = await prisma.educationRecord.create({ data: {
      profileId: ownerProfile.id, revision: 1, status: "VERIFIED",
      institution: "Starz University", qualification: "Computer Science",
      startMonth: "2024-01", current: true, description: "",
    } });
    createdCredentials.push(education.id);
    await prisma.credentialReview.create({ data: {
      profileId: ownerProfile.id, kind: "education", recordId: education.id,
      revision: 1, status: "VERIFIED", issuerName: null,
    } });
    const verified = (await view(visitor, owner)).verifiedCredentials;
    assert.equal(verified.length, 1);
    assert.equal(verified[0].title, "Computer Science");
    assert.equal(verified[0].verifiedBy, "BrightWay");
    assert.equal(Object.hasOwn(verified[0], "evidence"), false);
    await prisma.educationRecord.update({ where: { id: education.id }, data: { revision: 2 } });
    assert.deepEqual((await view(visitor, owner)).verifiedCredentials, []);

    const achievement = await prisma.memberPost.create({ data: {
      authorId: owner.id, requestKey: randomUUID(), type: "ACHIEVEMENT",
      body: "Published a new software project.", tags: ["Coding"],
    } });
    createdPosts.push(achievement.id);
    await prisma.postView.create({ data: { memberPostId: achievement.id, accountId: visitor.id } });
    await prisma.postLike.create({ data: { memberPostId: achievement.id, accountId: visitor.id } });
    await prisma.postComment.create({ data: { memberPostId: achievement.id,
      authorId: visitor.id, requestKey: randomUUID(), body: "Congratulations." } });
    await prisma.postRepost.create({ data: { memberPostId: achievement.id, accountId: visitor.id } });
    await prisma.postSave.create({ data: { memberPostId: achievement.id, accountId: owner.id } });
    const publicUrl = "/posts/members/" + owner.username;
    await request(null, publicUrl, { status: 401 });
    await request(visitor, publicUrl + "?unexpected=1", { status: 400 });
    const publicHistory = await request(visitor, publicUrl);
    assert.equal(publicHistory.items.length, 1);
    assert.equal(publicHistory.items[0].id, achievement.id);
    assert.equal(publicHistory.items[0].member.username, owner.username);
    assert.deepEqual(publicHistory.items[0].reaction, { count: 1, liked: true });
    assert.equal(publicHistory.items[0].views, 1);
    assert.equal(publicHistory.items[0].commentCount, 1);
    assert.equal(publicHistory.items[0].repostCount, 1);
    assert.equal(publicHistory.items[0].saved, false);
    assert.equal(publicHistory.items[0].reposted, true);
    assert.ok(!Object.hasOwn(publicHistory.items[0], "contact"));
    const memberHistory = await request(owner, "/posts/me");
    assert.equal(memberHistory.items.length, 1);
    assert.equal(memberHistory.items[0].id, achievement.id);
    assert.equal(memberHistory.items[0].member.name, "Synthetic owner");
    assert.deepEqual(memberHistory.items[0].reaction, { count: 1, liked: false });
    assert.equal(memberHistory.items[0].views, 1);
    assert.equal(memberHistory.items[0].commentCount, 1);
    assert.equal(memberHistory.items[0].repostCount, 1);
    assert.equal(memberHistory.items[0].saved, true);
    assert.equal(memberHistory.items[0].reposted, false);
    assert.equal(memberHistory.items[0].body, "Published a new software project.");
    assert.deepEqual(memberHistory.items[0].tags, ["Coding"]);
    assert.equal(Object.hasOwn(memberHistory.items[0], "likes"), false);
    assert.equal(Object.hasOwn(memberHistory.items[0], "_count"), false);
    const editPath = "/posts/me/" + achievement.id;
    const editedBody = "Published a revised and improved software project.";
    const editDraft = {
      expectedBody: achievement.body, expectedTags: ["Coding"],
      body: editedBody, tags: ["Coding", "Technology"],
    };
    await request(visitor, editPath, { method: "PATCH", body: editDraft, status: 404 });
    await request(owner, editPath, { method: "PATCH", body: editDraft,
      requestOrigin: "https://untrusted.invalid", status: 403 });
    await request(owner, editPath, { method: "PATCH",
      body: { ...editDraft, tags: [] }, status: 400 });
    const edited = await request(owner, editPath, { method: "PATCH", body: editDraft });
    assert.equal(edited.post.body, editedBody);
    assert.deepEqual(edited.post.tags, ["Coding", "Technology"]);
    assert.equal(edited.post.id, achievement.id);
    assert.equal(edited.post.createdAt, achievement.createdAt.toISOString(), "original date remains unchanged");
    assert.equal((await request(owner, "/posts/me")).items[0].commentCount, 1,
      "editing a post preserves its comments");
    assert.equal((await request(owner, "/posts/me")).items[0].views, 1,
      "editing a post preserves its view history");
    await request(owner, editPath, { method: "PATCH", body: editDraft, status: 409 });
    await request(owner, editPath, { method: "PATCH", body: {
      expectedBody: editedBody, expectedTags: ["Coding", "Technology"],
      body: "Bad event injection", tags: ["Coding"], eventDetails: {
        title: "Not an event", startAt: "2030-01-01T12:00:00.000Z",
        endAt: "2030-01-01T14:00:00.000Z", timezone: "UTC", format: "IN_PERSON", venue: "Monrovia",
      },
    }, status: 400 });

    const question = await prisma.memberPost.create({ data: {
      authorId: owner.id, requestKey: randomUUID(), type: "QUESTION",
      body: "How can I learn database design?", tags: ["Coding"],
      questionDetails: { title: "How can I learn database design?", intent: "GUIDANCE" },
    } });
    createdPosts.push(question.id);
    const questionResult = await request(owner, "/posts/me/" + question.id, {
      method: "PATCH", body: {
        expectedBody: question.body, expectedTags: ["Coding"],
        body: "What is the best way to learn Postgres?", tags: ["Coding"],
        questionDetails: { title: "What is the best way to learn Postgres?", intent: "DISCUSSION" },
      },
    });
    assert.equal(questionResult.post.questionDetails.intent, "DISCUSSION");
    assert.equal(questionResult.post.questionDetails.title, "What is the best way to learn Postgres?");

    const eventDetails = {
      title: "Community learning event", startAt: "2030-01-01T12:00:00.000Z",
      endAt: "2030-01-01T14:00:00.000Z", timezone: "UTC", format: "IN_PERSON",
      venue: "Monrovia", meetingUrl: "", coverTheme: "NAVY", currency: "USD",
      ticketPriceCents: 0, requiresApproval: false, capacity: 100,
    };
    const eventPost = await prisma.memberPost.create({ data: {
      authorId: owner.id, requestKey: randomUUID(), type: "EVENT",
      body: "Learn with the community.", tags: ["Education"], eventDetails,
    } });
    createdPosts.push(eventPost.id);
    await prisma.eventRegistration.create({ data: {
      memberPostId: eventPost.id, accountId: visitor.id, status: "PENDING",
    } });
    const eventEdit = { expectedBody: eventPost.body, expectedTags: ["Education"],
      body: "Join the learning community.", tags: ["Education"], eventDetails };
    const publicAll = await request(visitor, publicUrl);
    assert.deepEqual(new Set(publicAll.items.map(row => row.type)), new Set(["ACHIEVEMENT", "EVENT", "QUESTION"]));
    assert.ok(publicAll.items.some(row => row.type === "QUESTION" && row.answerCount === 0));
    assert.ok(publicAll.items.some(row => row.type === "EVENT" && row.registration.count === 0));
    assert.equal(Object.hasOwn(publicAll.items[0], "canManage"), false);
    const safeEvent = await request(owner, "/posts/me/" + eventPost.id,
      { method: "PATCH", body: eventEdit });
    assert.equal(safeEvent.post.body, eventEdit.body);
    await request(owner, "/posts/me/" + eventPost.id, { method: "PATCH", status: 409,
      body: { ...eventEdit, expectedBody: eventEdit.body,
        eventDetails: { ...eventDetails, ticketPriceCents: 2500 } },
    });
    assert.equal((await prisma.memberPost.findUnique({ where: { id: eventPost.id } }))
      .eventDetails.ticketPriceCents, 0, "registration protects original ticket price");

    await request(visitor, editPath, { method: "DELETE", body: {}, status: 404 });
    const deleted = await request(owner, editPath, { method: "DELETE", body: {} });
    assert.equal(deleted.id, achievement.id);
    assert.equal((await request(owner, "/posts/me")).items.some(item => item.id === achievement.id), false);
    await request(owner, editPath, { method: "PATCH",
      body: { expectedBody: editedBody, expectedTags: ["Coding", "Technology"],
        body: "Should fail", tags: ["Coding"] }, status: 404 });
    assert.equal((await dashboard(owner)).postImpressions, 0,
      "withdrawing a post removes its views from active profile impressions");

    const undeleted = await prisma.memberPost.findUnique({ where: { id: achievement.id } });
    assert.ok(undeleted.withdrawnAt, "post is soft-deleted rather than purging discussion records");
    assert.equal(undeleted.body, editedBody);
    assert.equal((await dashboard(owner)).postImpressions, 0, "deleted post views are excluded");
    assert.equal((await dashboard(visitor)).postImpressions, 0, "only the author's posts are counted");
    const published = await view(visitor, owner);
    assert.deepEqual(published.achievements, [], "withdrawn achievements must not appear");
    assert.equal(Object.hasOwn(published, "activities"), false,
      "public profile identity must not return a duplicate, unpaginated activity feed");
    const afterWithdrawal = await request(visitor, publicUrl);
    assert.deepEqual(new Set(afterWithdrawal.items.map(item => item.type)), new Set(["QUESTION", "EVENT"]));
    assert.equal(afterWithdrawal.items.some(item => item.id === achievement.id), false,
      "withdrawn posts do not appear in the public activity timeline");

    assert.equal((await dashboard(owner)).recentProfileViewers.length, 1);
    await preferences(visitor, { headline: "Learning with BrightWay" });
    const suggestionPath = "/explore/suggestions/people";
    await request(null, suggestionPath, { status: 401 });
    await request(visitor, suggestionPath + "?viewer=" + owner.id, { status: 400 });
    assert.deepEqual((await request(visitor, suggestionPath)).items, []);
    await prisma.profile.update({ where: { personId: owner.personId }, data: {
      skills: ["JavaScript"], interests: ["Technology"], careerField: "Engineering",
    } });
    await prisma.profile.update({ where: { personId: visitor.personId }, data: {
      skills: ["JavaScript"], interests: ["Technology"], careerField: "engineering",
    } });
    await prisma.profile.create({ data: { personId: other.personId, skills: ["JavaScript"], interests: ["Technology"] } });
    const suggestion = { name: "Synthetic owner", username: owner.username, reasons: ["Shared skills", "Shared interests", "Same career field"] };
    const otherSuggestion = { name: "Synthetic other", username: other.username, reasons: ["Shared skills", "Shared interests"] };
    assert.deepEqual((await request(visitor, suggestionPath)).items, [suggestion, otherSuggestion]);
    const follow = await prisma.networkFollow.create({ data: { followerId: visitor.id, targetAccountId: owner.id, active: true } });
    try {
      assert.deepEqual((await request(visitor, suggestionPath)).items, [otherSuggestion]);
    } finally {
      await prisma.networkFollow.delete({ where: { id: follow.id } });
    }
    await view(visitor, owner);
    assert.equal((await inbox(owner)).items.length, 1);
    await request(visitor, "/network/people/" + owner.username);
    await request(visitor, "/network/people/" + owner.username + "/contact");
    assert.equal((await inbox(owner)).items.length, 1,
      "network lookups and contact reads do not generate extra view notifications");

    await Promise.all([view(visitor, owner), view(visitor, owner)]);
    const { items } = await inbox(owner);
    assert.equal(items.length, 1);
    assert.deepEqual(items[0].viewer, { username: visitor.username, fullName: "Synthetic visitor" });
    assert.equal(items[0].readAt, null);
    assert.deepEqual((await inbox(other)).items, []);
    const itemPath = "/notifications/" + items[0].id;
    assert.deepEqual(await post(other, itemPath + "/read"), { updated: false });
    assert.deepEqual(await post(other, itemPath + "/dismiss"), { dismissed: false });
    assert.deepEqual(await post(owner, itemPath + "/read"), { updated: true });
    assert.ok((await inbox(owner)).items[0].readAt);
    assert.deepEqual(await post(owner, "/notifications/read-all"), { updated: 0 });

    await view(owner, visitor);
    assert.equal((await inbox(visitor)).items.length, 1);
    const networkAction = "/network/people/" + owner.username + "/actions";
    const block = await post(visitor, networkAction, { action: "BLOCK", expectedVersion: 0, requestKey: randomUUID() });
    assert.deepEqual((await dashboard(owner)).recentProfileViewers, [],
      "a block hides previously recorded visitor avatars");
    assert.deepEqual((await inbox(owner)).items, []);
    assert.deepEqual((await inbox(visitor)).items, []);
    await view(visitor, owner, { status: 404 });
    await view(owner, visitor, { status: 404 });
    await request(visitor, publicUrl, { status: 404 });
    assert.deepEqual((await request(visitor, suggestionPath)).items, [otherSuggestion]);
    assert.deepEqual((await request(owner, suggestionPath)).items, [otherSuggestion]);
    assert.deepEqual((await search(visitor, owner.username)).items, []);
    assert.deepEqual((await search(owner, visitor.username)).items, []);
    await post(visitor, networkAction, { action: "UNBLOCK", expectedVersion: block.version, requestKey: randomUUID() });
    assert.equal((await dashboard(owner)).recentProfileViewers.length, 1,
      "unblocked visitors may appear again");
    assert.deepEqual((await inbox(owner)).items, []);
    assert.deepEqual((await inbox(visitor)).items, []);

    await view(other, owner);
    const notice = (await inbox(owner)).items[0];
    assert.deepEqual(await post(owner, "/notifications/" + notice.id + "/dismiss"), { dismissed: true });
    assert.deepEqual((await inbox(owner)).items, []);
    const stillVisible = await view(visitor, owner);
    assert.equal(stillVisible.username, owner.username, "profiles remain visible with no publication toggle");
    assert.deepEqual((await search(visitor, owner.username)).items, [hit]);

    // Activity categories are independent from the post-only profile timeline.
    // Existing verified publication status lets other members read discussions
    // without exposing drafts, withdrawn posts or deleted contributions.
    await prisma.manualIdentityRequest.create({ data: {
      accountId: owner.id, state: "APPROVED", currentAttemptId: randomUUID(),
      initialSubmittedAt: new Date(), targetAt: new Date(Date.now() + 86400000),
      windowStart: new Date(), calendarVersion: "test",
    } });
    const comment = await prisma.postComment.create({ data: {
      authorId: owner.id, memberPostId: eventPost.id, requestKey: randomUUID(),
      body: "Looking forward to hosting the workshop.",
    } });
    const withdrawnComment = await prisma.postComment.create({ data: {
      authorId: owner.id, memberPostId: achievement.id, requestKey: randomUUID(),
      body: "Do not reveal comments on withdrawn achievements.",
    } });
    const answer = await prisma.questionAnswer.create({ data: {
      questionId: question.id, authorId: visitor.id,
      requestKey: randomUUID(), body: "Practice by creating a database schema.",
    } });
    const reply = await prisma.answerComment.create({ data: {
      answerId: answer.id, authorId: owner.id, requestKey: randomUUID(),
      body: "This is a helpful recommendation.",
    } });
    const commentsUrl = "/posts/members/" + owner.username + "/activity?kind=comments";
    const answersUrl = "/posts/members/" + visitor.username + "/activity?kind=answers";
    await request(null, commentsUrl, { status: 401 });
    await request(other, commentsUrl + "&irrelevant=1", { status: 400 });
    const comments = await request(other, commentsUrl);
    assert.deepEqual(new Set(comments.items.map(item => item.kind)), new Set(["comment", "reply"]));
    assert.ok(comments.items.some(item => item.id === comment.id && item.post.id === eventPost.id));
    assert.ok(comments.items.some(item => item.id === reply.id && item.post.id === question.id));
    assert.ok(!comments.items.some(item => item.id === withdrawnComment.id),
      "comments on withdrawn posts are not public");
    assert.equal(comments.items[0].post.source, "member");
    assert.equal(Object.hasOwn(comments.items[0], "email"), false);
    assert.equal(Object.hasOwn(comments.items[0], "meetingUrl"), false);
    assert.equal((await request(owner, "/posts/me/activity?kind=comments")).items.length, 2,
      "owners see the same visible contributions without a username");
    const answers = await request(other, answersUrl);
    assert.equal(answers.items.length, 1);
    assert.equal(answers.items[0].kind, "answer");
    assert.equal(answers.items[0].post.id, question.id);
    assert.equal(answers.items[0].body, "Practice by creating a database schema.");
    assert.equal(answers.items[0].upvoteCount, 0);
    assert.equal(answers.items[0].downvoteCount, 0);
    assert.equal((await request(visitor, "/posts/me/activity?kind=answers")).items.length, 1);
    await request(owner, "/posts/me/activity?kind=posts", { status: 400 });

    // Multiple comment sources share one cursor without losing or repeating a row.
    const base = Date.now() - 200000;
    await prisma.postComment.createMany({ data: Array.from({ length: 22 }, (_, index) => ({
      authorId: owner.id, memberPostId: eventPost.id, requestKey: randomUUID(),
      body: "Discussion contribution " + index,
      createdAt: new Date(base + index * 100),
    })) });
    const first = await request(other, commentsUrl);
    assert.equal(first.items.length, 20);
    assert.ok(first.nextCursor);
    await request(visitor, commentsUrl + "&cursor=" + encodeURIComponent(first.nextCursor),
      { status: 400 });
    await request(other, answersUrl + "&cursor=" + encodeURIComponent(first.nextCursor),
      { status: 400 });
    const second = await request(other, commentsUrl + "&cursor=" + encodeURIComponent(first.nextCursor));
    assert.equal(second.nextCursor, null);
    assert.equal(second.items.length, 4);
    assert.equal(new Set([...first.items, ...second.items].map(item => item.id)).size, 24);

    await prisma.postComment.update({ where: { id: comment.id },
      data: { deletedAt: new Date() } });
    await prisma.answerComment.update({ where: { id: reply.id },
      data: { deletedAt: new Date() } });
    const afterDeletion = await request(other, commentsUrl);
    assert.ok(!afterDeletion.items.some(item => item.id === comment.id),
      "deleted post comments are not shown");
    assert.ok(!afterDeletion.items.some(item => item.id === reply.id),
      "deleted replies are not shown");
    const blockAgain = await post(other, "/network/people/" + owner.username + "/actions",
      { action: "BLOCK", expectedVersion: 0, requestKey: randomUUID() });
    assert.ok(blockAgain.version > 0);
    await request(other, commentsUrl, { status: 404 });
    assert.deepEqual((await request(other, answersUrl)).items, [],
      "answers to a blocked question author must not leak through the activity list");
  } finally {
    try {
      await new Promise(resolve => server.close(resolve));
      const ids = accounts.map(row => row.id);
      const people = accounts.map(row => row.personId);
      await prisma.$transaction([
        prisma.profileViewNotification.deleteMany({ where: { recipientId: { in: ids } } }),
        prisma.networkEvent.deleteMany({ where: { actorId: { in: ids } } }),
        prisma.networkPair.deleteMany({ where: { leftAccountId: { in: ids } } }),
        prisma.credentialReview.deleteMany({ where: { profile: { personId: { in: people } } } }),
        prisma.memberPost.deleteMany({ where: { id: { in: createdPosts } } }),
        prisma.educationRecord.deleteMany({ where: { id: { in: createdCredentials } } }),
        prisma.profile.deleteMany({ where: { personId: { in: people } } }),
        prisma.photoAsset.deleteMany({ where: { id: { in: createdPhotos } } }),
        prisma.session.deleteMany({ where: { accountId: { in: ids } } }),
        prisma.manualIdentityRequest.deleteMany({ where: { accountId: { in: ids } } }),
        prisma.account.deleteMany({ where: { id: { in: ids } } }),
        prisma.person.deleteMany({ where: { id: { in: people } } }),
      ]);
    } finally {
      await prisma.$disconnect();
    }
  }
});
