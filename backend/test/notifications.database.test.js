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
    await preferences(owner, { ...published, headline: "Published fixture" });
    await view(null, owner, { status: 401 });
    await view(visitor, owner, { requestOrigin: "https://foreign.invalid", status: 403 });

    const profile = await view(visitor, owner);
    assert.equal(profile.headline, "Published fixture");
    for (const field of ["contact", "email", "phoneNumber", "education", "experience", ...Object.keys(published)]) {
      assert.equal(Object.hasOwn(profile, field), false, field);
    }
    assert.deepEqual((await inbox(owner)).items, []);

    await preferences(visitor, published);
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
    await post(visitor, networkAction, { action: "UNBLOCK", expectedVersion: block.version, requestKey: randomUUID() });
    assert.deepEqual((await inbox(owner)).items, []);
    assert.deepEqual((await inbox(visitor)).items, []);

    await preferences(other, { profileViewSharingEnabled: true });
    await view(other, owner);
    const notice = (await inbox(owner)).items[0];
    assert.deepEqual(await post(owner, "/notifications/" + notice.id + "/dismiss"), { dismissed: true });
    assert.deepEqual((await inbox(owner)).items, []);
  } finally {
    try {
      await new Promise(resolve => server.close(resolve));
      const ids = accounts.map(row => row.id);
      const people = accounts.map(row => row.personId);
      await prisma.$transaction([
        prisma.profileViewNotification.deleteMany({ where: { recipientId: { in: ids } } }),
        prisma.networkEvent.deleteMany({ where: { actorId: { in: ids } } }),
        prisma.networkPair.deleteMany({ where: { leftAccountId: { in: ids } } }),
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
