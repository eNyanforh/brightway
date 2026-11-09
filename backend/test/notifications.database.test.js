import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { tokenHash } from "../src/modules/auth/session.service.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const origin = "http://localhost:5173";

test("the real app keeps profile view consent, inbox ownership and block cleanup in PostgreSQL", {
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
    await prisma.session.create({ data: {
      accountId: row.id,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + 86400000),
    } });
    return { ...row, cookie: "brightway_session=" + token, version: 0 };
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
    const published = {
      profilePublicEnabled: true,
      profileViewSharingEnabled: true,
      profileViewNotificationsEnabled: true,
    };
    await view(visitor, owner, { status: 404 });
    await request(null, "/profile/me/dashboard", { status: 401 });
    await preferences(owner, { ...published, headline: "Published fixture" });
    assert.deepEqual(((stats) => [stats.profileViews, stats.postImpressions, stats.searchAppearances])(await dashboard(owner)), [0, 0, 0]);
    const search = (actor, q, options = {}, status = 200) =>
      request(actor, "/search?" + new URLSearchParams({ q, kind: "people", ...options }), { status });
    await search(null, owner.username, {}, 401);
    await search(visitor, "!!", {}, 400);
    const hit = { kind: "people", name: "Synthetic owner", username: owner.username, href: "/people/" + owner.username };
    assert.deepEqual(await search(visitor, "synt own"), { items: [hit], nextCursor: null });
    assert.deepEqual((await search(visitor, "@" + owner.username)).items, [hit]);
    const searchStats = await dashboard(owner);
    assert.equal(searchStats.searchAppearances, 1, "repeated searches from one member count once per UTC day");
    assert.equal(searchStats.profileViews, 0, "directory appearances are not profile views");
    assert.equal(Object.hasOwn(searchStats, "viewerId"), false);
    assert.deepEqual((await search(owner, owner.username)).items, []);
    assert.deepEqual((await search(visitor, other.username)).items, []);
    assert.deepEqual((await search(visitor, owner.email)).items, []);
    assert.deepEqual((await search(visitor, "x') OR 1=1 --")).items, []);

    const batch = randomUUID().replaceAll("-", "").slice(0, 8);
    for (let i = 0; i < 22; i++) {
      const row = await prisma.account.create({ data: {
        username: `search_${batch}_${String(i).padStart(2, "0")}`,
        email: `search_${batch}_${i}@example.invalid`, passwordHash: "synthetic-unusable-hash",
        person: { create: { firstName: "Directory", lastName: batch, profile: { create: { profilePublicEnabled: true } } } },
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

    const profile = await view(visitor, owner);
    assert.equal(profile.headline, "Published fixture");
    await view(visitor, owner);
    assert.equal((await dashboard(owner)).profileViews, 1, "repeated public visits from one member count once per UTC day");
    assert.equal((await dashboard(visitor)).profileViews, 0, "visits belong to the profile owner only");
    for (const field of ["contact", "email", "phoneNumber", "education", "experience", ...Object.keys(published)]) {
      assert.equal(Object.hasOwn(profile, field), false, field);
    }
    assert.deepEqual((await inbox(owner)).items, []);

    // The public profile stays minimal until the member enables each section.
    const certificate = { title: "Data Analysis Certificate", issuer: "Training Center",
      issuedMonth: "2026-08", expiresMonth: null,
      credentialUrl: "https://certificates.example.org/abc" };
    await preferences(owner, { certifications: [certificate] });
    assert.equal(Object.hasOwn(await view(visitor, owner), "certifications"), false);
    await preferences(owner, { profileCertificationsPublicEnabled: true });
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
    assert.equal(Object.hasOwn(await view(visitor, owner), "verifiedCredentials"), false);
    await preferences(owner, { profileCredentialsPublicEnabled: true });
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
    await preferences(owner, { profileAchievementsPublicEnabled: true });
    assert.equal(Object.hasOwn(await view(visitor, owner), "achievements"), false,
      "Unverified member posts must not be promoted onto a public profile");
    await preferences(owner, { profileCertificationsPublicEnabled: false,
      profileCredentialsPublicEnabled: false });
    const hidden = await view(visitor, owner);
    assert.equal(Object.hasOwn(hidden, "certifications"), false);
    assert.equal(Object.hasOwn(hidden, "verifiedCredentials"), false);

    await preferences(visitor, published);
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
    assert.deepEqual((await request(visitor, suggestionPath)).items, [suggestion]);
    const follow = await prisma.networkFollow.create({ data: { followerId: visitor.id, targetAccountId: owner.id, active: true } });
    try {
      assert.deepEqual((await request(visitor, suggestionPath)).items, []);
    } finally {
      await prisma.networkFollow.delete({ where: { id: follow.id } });
    }
    await preferences(owner, { profileViewNotificationsEnabled: false });
    await view(visitor, owner);
    assert.deepEqual((await inbox(owner)).items, []);
    await preferences(owner, { profileViewNotificationsEnabled: true });
    await request(visitor, "/network/people/" + owner.username);
    await request(visitor, "/network/people/" + owner.username + "/contact");
    assert.deepEqual((await inbox(owner)).items, []);

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
    assert.deepEqual((await inbox(owner)).items, []);
    assert.deepEqual((await inbox(visitor)).items, []);
    await view(visitor, owner, { status: 404 });
    await view(owner, visitor, { status: 404 });
    assert.deepEqual((await request(visitor, suggestionPath)).items, []);
    assert.deepEqual((await request(owner, suggestionPath)).items, []);
    assert.deepEqual((await search(visitor, owner.username)).items, []);
    assert.deepEqual((await search(owner, visitor.username)).items, []);
    await post(visitor, networkAction, { action: "UNBLOCK", expectedVersion: block.version, requestKey: randomUUID() });
    assert.deepEqual((await inbox(owner)).items, []);
    assert.deepEqual((await inbox(visitor)).items, []);

    await preferences(other, { profileViewSharingEnabled: true });
    await view(other, owner);
    const notice = (await inbox(owner)).items[0];
    assert.deepEqual(await post(owner, "/notifications/" + notice.id + "/dismiss"), { dismissed: true });
    assert.deepEqual((await inbox(owner)).items, []);
    await preferences(owner, { profilePublicEnabled: false });
    // Turning off basic publication revokes every optional public section.
    await view(visitor, owner, { status: 404 });
    assert.deepEqual((await request(visitor, suggestionPath)).items, []);
    assert.deepEqual((await search(visitor, owner.username)).items, []);
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
        prisma.session.deleteMany({ where: { accountId: { in: ids } } }),
        prisma.account.deleteMany({ where: { id: { in: ids } } }),
        prisma.person.deleteMany({ where: { id: { in: people } } }),
      ]);
    } finally {
      await prisma.$disconnect();
    }
  }
});
