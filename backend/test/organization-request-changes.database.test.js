import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createOrganizationService } from "../src/modules/organizations/organization.service.js";
test("database owner edit/abort races invalidate old findings and decisions atomically without moving review targets", { skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database" }, async () => {
  const { PrismaClient } = await import("@prisma/client"), { PrismaPg } = await import("@prisma/adapter-pg");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }), transactionOptions: { maxWait: 10000, timeout: 15000 } });
  const service = createOrganizationService({ prisma: db }), marker = randomUUID(), accounts = [], sessions = [];
  try {
    for (const label of ["owner", "agent", "approver"]) {
      const account = await db.account.create({ data: { username: `chg_${label}_${marker.replaceAll("-", "").slice(0, 12)}`, email: `${label}_${marker}@example.invalid`, passwordHash: "synthetic-unusable", emailVerifiedAt: new Date(), person: { create: { firstName: "Synthetic", lastName: label } } } }); accounts.push(account);
      if (label !== "owner") await db.mfaFactor.create({ data: { accountId: account.id, encryptedSecret: "synthetic-unusable", enabled: true, version: 1, windowStart: new Date() } });
      sessions.push(await db.session.create({ data: { accountId: account.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 86400000), mfaVersion: label === "owner" ? 0 : 1, mfaVerifiedAt: label === "owner" ? null : new Date() } }));
    }
    const [owner, agent, approver] = accounts;
    await db.organizationOperator.create({ data: { accountId: agent.id, agentEnabled: true } }); await db.organizationOperator.create({ data: { accountId: approver.id, approverEnabled: true } });
    const input = { idempotencyKey: randomUUID(), name: `Synthetic request ${marker}`, type: "SCHOOL", representativeRole: "Principal", countryCode: "GH", region: "", city: "Accra", address: "Synthetic test location" };
    const submit = () => service.submit(owner.id, sessions[0].id, { ...input, idempotencyKey: randomUUID() });
    async function recommend(r) {
      const a = await service.assign(approver.id, sessions[2].id, r.id, { expectedVersion: r.version, agentUsername: agent.username });
      return service.report(agent.id, sessions[1].id, r.id, { expectedVersion: a.version, existenceConfirmed: true, locationConfirmed: true, authorityConfirmed: true, typeConfirmed: true, operationalConfirmed: true, recommendation: "APPROVE", notes: "Synthetic investigation for concurrency testing.", setupAssistance: "" });
    }
    const r = await recommend(await submit()), original = await db.organizationRequest.findUnique({ where: { id: r.id } });
    const { idempotencyKey, ...fields } = input; void idempotencyKey;
    const body = { ...fields, name: "Edited synthetic school", expectedVersion: r.version };
    const changed = await Promise.allSettled([service.edit(owner.id, sessions[0].id, r.id, body), service.edit(owner.id, sessions[0].id, r.id, body)]);
    assert.equal(changed.filter(x => x.status === "fulfilled").length, 1); assert.equal(changed.find(x => x.status === "rejected").reason.status, 409);
    const next = changed.find(x => x.status === "fulfilled").value;
    assert.equal(next.status, "SUBMITTED"); assert.equal(+next.targetAt, +original.targetAt); assert.equal(await db.organizationRequestRevision.count({ where: { requestId: r.id } }), 1);
    assert.equal((await db.organizationRequestRevision.findFirst({ where: { requestId: r.id } })).snapshot.name, original.name);
    assert.equal(await db.organizationFinding.count({ where: { requestId: r.id } }), 0); assert.equal(await db.organizationFindingArchive.count({ where: { requestId: r.id } }), 1);
    const fresh = await recommend(next), decision = { expectedVersion: fresh.version, decision: "APPROVE", reason: "Synthetic independent authorized approval." };
    // The requester and approver acquire the same owner row lock: exactly one terminal action wins.
    const terminal = await Promise.allSettled([service.abort(owner.id, sessions[0].id, r.id, { expectedVersion: fresh.version }), service.decide(approver.id, sessions[2].id, r.id, decision)]);
    assert.equal(terminal.filter(x => x.status === "fulfilled").length, 1); assert.equal(terminal.find(x => x.status === "rejected").reason.status, 409);
    const saved = await db.organizationRequest.findUnique({ where: { id: r.id } });
    assert.equal(await db.organization.count({ where: { requestId: r.id } }), saved.status === "APPROVED" ? 1 : 0);
    // Exercise an unassigned abort against the migrated CHECK constraint and release its active fingerprint.
    const second = await submit(); const aborted = await service.abort(owner.id, sessions[0].id, second.id, { expectedVersion: second.version }); assert.equal(aborted.status, "ABORTED");
    assert.equal((await submit()).status, "SUBMITTED");
    // A failed edit audit must roll back the private input snapshot and current request as well.
    const active = await db.organizationRequest.findFirst({ where: { applicantId: owner.id, status: "SUBMITTED" } });
    const failing = new Proxy(db, { get(target, key) {
      if (key === "$transaction") return work => target.$transaction(tx => work(new Proxy(tx, { get(client, field) {
        if (field === "organizationRequestAudit") return { create: async () => { throw Error("Injected edit audit failure"); } };
        const value = client[field]; return typeof value === "function" ? value.bind(client) : value;
      } })));
      const value = target[key]; return typeof value === "function" ? value.bind(target) : value;
    } });
    await assert.rejects(createOrganizationService({ prisma: failing }).edit(owner.id, sessions[0].id, active.id, { ...body, expectedVersion: active.version }), /Injected edit audit failure/);
    assert.equal(await db.organizationRequestRevision.count({ where: { requestId: active.id } }), 0); assert.equal((await db.organizationRequest.findUnique({ where: { id: active.id } })).version, active.version);
  } finally {
    try {
      const ids = accounts.map(a => a.id), requests = await db.organizationRequest.findMany({ where: { applicantId: { in: ids } }, select: { id: true } }), requestIds = requests.map(r => r.id);
      const organizations = await db.organization.findMany({ where: { requestId: { in: requestIds } }, select: { id: true } }), orgIds = organizations.map(o => o.id);
      await db.organizationMembership.deleteMany({ where: { organizationId: { in: orgIds } } }); await db.organizationOperatingLocation.deleteMany({ where: { organizationId: { in: orgIds } } }); await db.organization.deleteMany({ where: { id: { in: orgIds } } });
      for (const model of ["organizationRequestRevision", "organizationFindingArchive", "organizationFinding", "organizationRequestAudit"]) await db[model].deleteMany({ where: { requestId: { in: requestIds } } });
      await db.organizationRequest.deleteMany({ where: { id: { in: requestIds } } }); await db.organizationOperator.deleteMany({ where: { accountId: { in: ids } } }); await db.session.deleteMany({ where: { accountId: { in: ids } } }); await db.mfaFactor.deleteMany({ where: { accountId: { in: ids } } }); await db.account.deleteMany({ where: { id: { in: ids } } }); await db.person.deleteMany({ where: { id: { in: accounts.map(a => a.personId) } } });
    } finally { await db.$disconnect(); }
  }
});
