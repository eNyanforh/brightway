import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createContentSearch } from "../src/modules/search/content-search.service.js";
import { createOrganizationPosts } from "../src/modules/posts/organization-posts.service.js";

const skip = !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a migrated isolated database";

test("content discovery uses PostgreSQL full-text matching, current blocks, and post verification", { skip }, async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }) });
  const people = [];
  const posts = [];

  async function person(label) {
    const code = randomUUID().slice(0, 12);
    const row = await db.account.create({ data: {
      username: "discover_" + code,
      email: "discover_" + code + "@example.invalid",
      passwordHash: "synthetic-unusable",
      person: { create: { firstName: "Discovery", lastName: label } },
    } });
    people.push(row);
    const session = await db.session.create({ data: {
      accountId: row.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 86400000),
    } });
    return { ...row, actor: { accountId: row.id, sessionId: session.id } };
  }

  try {
    const owner = await person("Owner");
    const viewer = await person("Viewer");
    const achievement = await db.memberPost.create({ data: {
      authorId: owner.id, requestKey: randomUUID(),
      type: "ACHIEVEMENT", body: "Built a project for rural communities.",
      tags: ["robotics"],
    } });
    const question = await db.memberPost.create({ data: {
      authorId: owner.id, requestKey: randomUUID(),
      type: "QUESTION", body: "What tools can students use?",
      questionDetails: { title: "How do students learn robotics?" }, tags: ["education"],
    } });
    const event = await db.memberPost.create({ data: {
      authorId: owner.id, requestKey: randomUUID(),
      type: "EVENT", body: "Join us for a public workshop.",
      eventDetails: { title: "Robotics learning weekend", meetingUrl: "https://private.invalid/room" },
      tags: ["technology"],
    } });
    posts.push(achievement.id, question.id, event.id);

    // A minimal trusted renderer tests the SQL index and filtering in isolation.
    const trustedPosts = { async readPost(_actor, source, id) {
      assert.equal(source, "member");
      const row = await db.memberPost.findUniqueOrThrow({ where: { id } });
      return { post: { ...row, member: {
        name: "Discovery Owner", username: owner.username, photoId: null, verified: true,
      } } };
    } };
    const search = createContentSearch({ prisma: db, posts: trustedPosts });
    const matches = await search(viewer.actor, { q: "robotics", kind: "all" });
    assert.deepEqual(new Set(matches.items.map(item => item.kind)),
      new Set(["achievements", "questions", "events"]),
      "matches tag, question title and event title");
    assert.equal(matches.items[0].kind, "events", "an event title prefix outranks title-suffix and topic-only matches");
    assert.equal(JSON.stringify(matches).includes("private.invalid"), false);

    const questionOnly = await search(viewer.actor, { q: "robotics", kind: "questions" });
    assert.deepEqual(questionOnly.items.map(item => item.kind), ["questions"]);

    // The real Explore authorization must exclude this author's unverified posts.
    const secure = createContentSearch({ prisma: db, posts: createOrganizationPosts({ prisma: db }) });
    assert.deepEqual((await secure(viewer.actor, { q: "robotics", kind: "all" })).items, []);

    const [leftAccountId, rightAccountId] = [owner.id, viewer.id].sort();
    await db.networkPair.create({ data: {
      leftAccountId, rightAccountId, status: "NONE", leftBlocked: true,
    } });
    assert.deepEqual((await search(viewer.actor, { q: "robotics", kind: "all" })).items, [],
      "a bilateral block removes matching posts before any rendering");
    await db.networkPair.delete({ where: { leftAccountId_rightAccountId: { leftAccountId, rightAccountId } } });

    await db.memberPost.update({ where: { id: event.id }, data: { withdrawnAt: new Date() } });
    assert.equal((await search(viewer.actor, { q: "robotics", kind: "events" })).items.length, 0);
  } finally {
    try {
      await db.networkPair.deleteMany({ where: { OR: [
        { leftAccountId: { in: people.map(p => p.id) } },
        { rightAccountId: { in: people.map(p => p.id) } },
      ] } });
      await db.memberPost.deleteMany({ where: { id: { in: posts } } });
      await db.session.deleteMany({ where: { accountId: { in: people.map(p => p.id) } } });
      for (const account of people) {
        await db.account.delete({ where: { id: account.id } });
        await db.person.delete({ where: { id: account.personId } });
      }
    } finally { await db.$disconnect(); }
  }
});
