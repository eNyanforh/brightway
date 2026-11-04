import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createNetworkService } from "../src/modules/network/network.service.js";
const skip = !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database";
async function fixture() {
  const { PrismaClient } = await import("@prisma/client"), { PrismaPg } = await import("@prisma/adapter-pg");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }), transactionOptions: { maxWait: 10000, timeout: 15000 } });
  const accounts = []; let clock = new Date(); const now = () => clock, service = createNetworkService({ prisma: db, now });
  async function account() {
    const row = await db.account.create({ data: { username: `net_${randomUUID().slice(0, 8)}`, email: `${randomUUID()}@example.invalid`, passwordHash: "synthetic-unusable", person: { create: { firstName: "Synthetic", lastName: "Person", phoneNumber: "+231770000000" } } } }); accounts.push(row);
    const session = await db.session.create({ data: { accountId: row.id, tokenHash: randomUUID(), expiresAt: new Date(+clock + 40 * 86400000) } }); return { ...row, actor: { accountId: row.id, sessionId: session.id } };
  }
  async function pair(a, b) { const [leftAccountId, rightAccountId] = [a.id, b.id].sort(); return db.networkPair.findUnique({ where: { leftAccountId_rightAccountId: { leftAccountId, rightAccountId } } }); }
  const a = await account(), b = await account(), c = await account();
  return { db, service, a, b, c, account, pair, now, advance(ms) { clock = new Date(+clock + ms); },
    act: (who, target, action, version, requestKey = randomUUID()) => service.action(who.actor, target.username, { action, expectedVersion: version, requestKey }),
    async close() { try { const ids = accounts.map(a => a.id); await db.networkEvent.deleteMany({ where: { actorId: { in: ids } } }); await db.networkPair.deleteMany({ where: { OR: [{ leftAccountId: { in: ids } }, { rightAccountId: { in: ids } }] } }); for (const row of accounts) { await db.profile.deleteMany({ where: { personId: row.personId } }); await db.session.deleteMany({ where: { accountId: row.id } }); await db.mfaFactor.deleteMany({ where: { accountId: row.id } }); await db.account.delete({ where: { id: row.id } }); await db.person.delete({ where: { id: row.personId } }); } } finally { await db.$disconnect(); } },
  };
}
test("database connection consent, strict ownership, cancellation/removal and replay receipts preserve one pair and audit", { skip }, async () => {
  const f = await fixture(); try {
    const { a, b, c, service } = f, key = randomUUID();
    const results = await Promise.all([f.act(a, b, "REQUEST", 0, key), f.act(a, b, "REQUEST", 0, key)]); assert.deepEqual(results[0], results[1]); assert.equal(await f.db.networkPair.count({ where: { OR: [{ leftAccountId: a.id }, { rightAccountId: a.id }] } }), 1);
    assert.equal((await service.list(b.actor, { view: "incoming" })).items[0].person.username, a.username);
    assert.equal((await service.list(c.actor, { view: "incoming" })).items.length, 0);
    assert.equal((await service.person(a.actor, b.username)).relationship.state, "OUTGOING");
    await assert.rejects(f.act(a, b, "ACCEPT", 1), { status: 403 });
    await assert.rejects(f.act(c, b, "ACCEPT", 0), { status: 403 });
    await assert.rejects(f.act(a, b, "REQUEST", 0, randomUUID()), { status: 409 });
    await assert.rejects(f.act(a, b, "BLOCK", 0, key), { status: 409 });
    await f.act(b, a, "ACCEPT", 1); assert.equal((await service.person(a.actor, b.username)).relationship.state, "CONNECTED");
    assert.equal((await service.list(a.actor, {})).items.length, 1); await f.act(a, b, "REMOVE", 2);
    assert.equal((await service.list(a.actor, {})).items.length, 0); assert.equal((await f.pair(a, b)).version, 3);
    await assert.rejects(f.act(a, b, "REQUEST", 3), { status: 429 }); f.advance(86400001); await f.act(a, b, "REQUEST", 3); await f.act(a, b, "CANCEL", 4);
    f.advance(86400001); await f.act(a, b, "REQUEST", 5); await f.act(b, a, "DECLINE", 6); assert.equal((await f.pair(a, b)).status, "NONE");
    assert.equal(await f.db.networkEvent.count({ where: { pairId: (await f.pair(a, b)).id } }), 7);
    const serialized = JSON.stringify(await service.person(a.actor, b.username)); for (const secret of [b.email, b.passwordHash, b.personId, b.id, "phoneNumber"]) assert(!serialized.includes(secret));
    await assert.rejects(f.act(a, a, "REQUEST", 0), { status: 400 });
  } finally { await f.close(); }
});
test("database competing requests and accept/block races serialize; bilateral blocks require independent unblocking", { skip }, async () => {
  const f = await fixture(); try {
    const { a, b, service } = f;
    const crossed = await Promise.allSettled([f.act(a, b, "REQUEST", 0), f.act(b, a, "REQUEST", 0)]); assert.equal(crossed.filter(x => x.status === "fulfilled").length, 1);
    const row = await f.pair(a, b), recipient = row.requestedById === a.id ? b : a, sender = recipient.id === a.id ? b : a;
    const raced = await Promise.allSettled([f.act(recipient, sender, "ACCEPT", 1), f.act(sender, recipient, "BLOCK", 1)]); assert.equal(raced.filter(x => x.status === "fulfilled").length, 1);
    let current = await f.pair(a, b); if (current.status === "CONNECTED") await f.act(sender, recipient, "BLOCK", current.version);
    await assert.rejects(service.person(recipient.actor, sender.username), { status: 404 });
    await f.act(recipient, sender, "BLOCK", (await f.pair(a, b)).version);
    await f.act(sender, recipient, "UNBLOCK", (await f.pair(a, b)).version);
    await assert.rejects(service.person(sender.actor, recipient.username), { status: 404 });
    await f.act(recipient, sender, "UNBLOCK", (await f.pair(a, b)).version);
    current = await f.pair(a, b); assert.equal(current.status, "NONE"); assert.equal(current.requestedById, null);
    assert.equal((await service.list(sender.actor, {})).items.length, 0);
  } finally { await f.close(); }
});
test("database contacts use exact accepted connections and current privacy; removal/block/suspension immediately withdraw access", { skip }, async () => {
  const f = await fixture(); try {
    const { a, b, service } = f;
    await f.db.profile.create({ data: { personId: b.personId, phoneVisibility: "CONNECTIONS", emailVisibility: "PUBLIC", whatsappVisibility: "ONLY_ME", whatsappNumber: "+231880000000" } });
    assert.deepEqual(await service.visibleContact(b.username, a.personId), { email: b.email });
    await f.act(a, b, "REQUEST", 0); assert.deepEqual(await service.visibleContact(b.username, a.personId), { email: b.email });
    await f.act(b, a, "ACCEPT", 1); assert.equal((await service.visibleContact(b.username, a.personId)).phoneNumber, "+231770000000");
    assert(!("whatsappNumber" in await service.visibleContact(b.username, a.personId)));
    assert.equal((await service.visibleContact(b.username, b.personId)).whatsappNumber, "+231880000000");
    await f.act(a, b, "REMOVE", 2); assert.deepEqual(await service.visibleContact(b.username, a.personId), { email: b.email });
    await f.act(b, a, "BLOCK", 3); assert.deepEqual(await service.visibleContact(b.username, a.personId), {});
    assert.deepEqual(await service.visibleContact(a.username, b.personId), {});
    await f.db.account.update({ where: { id: b.id }, data: { status: "SUSPENDED" } }); await assert.rejects(service.visibleContact(b.username, a.personId), { status: 404 });
    await f.act(a, b, "BLOCK", 4); assert.equal((await service.list(a.actor, { view: "blocked" })).items[0].person.username, b.username);
    assert.equal((await service.person(a.actor, b.username)).relationship.state, "BLOCKED"); await f.act(a, b, "UNBLOCK", 5);
    assert.equal((await service.list(a.actor, { view: "blocked" })).items.length, 0);
  } finally { await f.close(); }
});
test("database network transactions roll back failed audits and reject revoked/expired/wrong-realm/stale-factor sessions", { skip }, async () => {
  const f = await fixture(); try {
    const { a, b, service } = f;
    const broken = createNetworkService({ prisma: new Proxy(f.db, { get(target, prop) { if (prop === "$transaction") return work => target.$transaction(tx => work(new Proxy(tx, { get(t, p) { if (p === "networkEvent") return { ...t.networkEvent, create: async () => { throw Error("Injected audit failure"); } }; return t[p]; } }))); return Reflect.get(target, prop); } }), now: f.now });
    await assert.rejects(broken.action(a.actor, b.username, { action: "REQUEST", expectedVersion: 0, requestKey: randomUUID() })); assert.equal(await f.pair(a, b), null);
    await assert.rejects(service.list({ staffId: "mg_synthetic", sessionId: a.actor.sessionId }, {}), { status: 401 });
    await f.db.session.delete({ where: { id: a.actor.sessionId } }); await assert.rejects(service.person(a.actor, b.username), { status: 401 }); await assert.rejects(f.act(a, b, "BLOCK", 0), { status: 401 });
    await f.db.session.update({ where: { id: b.actor.sessionId }, data: { expiresAt: new Date(0) } }); await assert.rejects(service.list(b.actor, {}), { status: 401 });
    await f.db.mfaFactor.create({ data: { accountId: f.c.id, enabled: true, encryptedSecret: "synthetic-unusable", version: 2, windowStart: f.now() } }); await assert.rejects(service.list(f.c.actor, {}), { status: 401 });
  } finally { await f.close(); }
});
test("database network pagination is actor/view scoped and repeated requests cannot exceed persisted budgets", { skip }, async () => {
  const f = await fixture(); try {
    const { a, b, c, service } = f;
    for (let i = 0; i < 22; i++) { const other = await f.account(); await f.act(a, other, "REQUEST", 0); }
    const first = await service.list(a.actor, { view: "outgoing" }); assert.equal(first.items.length, 20); assert(first.nextCursor);
    const second = await service.list(a.actor, { view: "outgoing", cursor: first.nextCursor }); assert.equal(second.items.length, 2);
    assert(!first.items.some(x => second.items.some(y => y.person.username === x.person.username)));
    await assert.rejects(service.list(b.actor, { view: "outgoing", cursor: first.nextCursor }), { status: 400 });
    await assert.rejects(service.list(a.actor, { view: "incoming", cursor: first.nextCursor }), { status: 400 });
    await assert.rejects(service.list(a.actor, { cursor: "forged" }), { status: 400 });
    const row = await f.pair(a, (await f.db.account.findUnique({ where: { username: first.items[0].person.username } })));
    await f.db.networkEvent.createMany({ data: Array.from({ length: 8 }, () => ({ id: randomUUID(), pairId: row.id, actorId: a.id, action: "REQUEST", requestKey: randomUUID(), requestHash: "0".repeat(64), resultVersion: 1, createdAt: f.now() })) });
    await assert.rejects(f.act(a, b, "REQUEST", 0), { status: 429 }); assert.equal(await f.pair(a, b), null);
    await f.act(c, b, "REQUEST", 0); assert.equal((await service.list(b.actor, { view: "incoming" })).items.length, 1);
  } finally { await f.close(); }
});
