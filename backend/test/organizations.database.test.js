import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createOrganizationService } from "../src/modules/organizations/organization.service.js";

test("database organization submission/decision races, separate roles and failed audits preserve one organization and primary administrator", {
  skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database",
}, async () => {
  const { PrismaClient } = await import("@prisma/client"), { PrismaPg } = await import("@prisma/adapter-pg");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }), transactionOptions: { maxWait: 10000, timeout: 15000 } });
  const marker = randomUUID(), accounts = [], sessions = [], now = new Date();
  const service = createOrganizationService({ prisma: db });
  try {
    for (const label of ["owner", "agent", "admin"]) {
      const account = await db.account.create({ data: { username: `org_${label}_${marker.replaceAll("-", "").slice(0, 16)}`, email: `org_${label}_${marker}@example.invalid`, passwordHash: "synthetic-unusable-hash", emailVerifiedAt: now, person: { create: { firstName: "Synthetic", lastName: label } } } }); accounts.push(account);
      const mfa = label !== "owner";
      if (mfa) await db.mfaFactor.create({ data: { accountId: account.id, encryptedSecret: "synthetic-test-no-usable-key", enabled: true, version: 1, windowStart: now } });
      sessions.push(await db.session.create({ data: { accountId: account.id, tokenHash: randomUUID(), expiresAt: new Date(+now + 86400000), mfaVersion: mfa ? 1 : 0, mfaVerifiedAt: mfa ? now : null } }));
    }
    const [owner, agent, admin] = accounts;
    await db.organizationOperator.create({ data: { accountId: agent.id, agentEnabled: true } });
    await db.organizationOperator.create({ data: { accountId: admin.id, approverEnabled: true } });
    const input = { name: `Synthetic global NGO ${marker}`, type: "NGO", representativeRole: "Director", countryCode: "GH", region: "", city: "Accra", address: "Synthetic fixture address", offersTraining: true, idempotencyKey: randomUUID() };
    // No verified individual/profile/credential state is created for this authenticated representative.
    const submitted = await Promise.all([service.submit(owner.id, sessions[0].id, input), service.submit(owner.id, sessions[0].id, input)]);
    const r = submitted[0]; assert.equal(r.id, submitted[1].id); assert.equal(await db.organizationRequest.count({ where: { applicantId: owner.id } }), 1);
    await assert.rejects(service.submit(owner.id, sessions[0].id, { ...input, idempotencyKey: randomUUID() }), { status: 409 });
    await assert.rejects(service.publicOrganization(r.id), { status: 404 });
    assert.equal(await db.organization.count({ where: { requestId: r.id } }), 0);
    const assignment = { expectedVersion: r.version, agentUsername: agent.username };
    const assignments = await Promise.allSettled([service.assign(admin.id, sessions[2].id, r.id, assignment), service.assign(admin.id, sessions[2].id, r.id, assignment)]);
    assert.equal(assignments.filter(x => x.status === "fulfilled").length, 1); assert.equal(assignments.find(x => x.status === "rejected").reason.status, 409);
    const assigned = assignments.find(x => x.status === "fulfilled").value;
    const finding = { expectedVersion: assigned.version, existenceConfirmed: true, locationConfirmed: true, authorityConfirmed: true, typeConfirmed: true, operationalConfirmed: true, recommendation: "APPROVE", notes: "Synthetic structured Agent findings; no user evidence.", setupAssistance: "Synthetic setup assistance note." };
    const reports = await Promise.allSettled([service.report(agent.id, sessions[1].id, r.id, finding), service.report(agent.id, sessions[1].id, r.id, finding)]);
    assert.equal(reports.filter(x => x.status === "fulfilled").length, 1);
    assert.equal(await db.organizationFinding.count({ where: { requestId: r.id } }), 1);
    const recommended = reports.find(x => x.status === "fulfilled").value;
    const decision = { expectedVersion: recommended.version, decision: "APPROVE", reason: "Synthetic authorized final organization approval." };
    await db.organizationOperator.update({ where: { accountId: agent.id }, data: { approverEnabled: true } });
    await assert.rejects(service.decide(agent.id, sessions[1].id, r.id, decision), { status: 403 });
    await db.organizationOperator.update({ where: { accountId: agent.id }, data: { agentEnabled: false } });
    await assert.rejects(service.decide(admin.id, sessions[2].id, r.id, decision), { status: 409 });
    await db.organizationOperator.update({ where: { accountId: agent.id }, data: { agentEnabled: true } });
    function failDecisionAudit(client) {
      return new Proxy(client, { get(target, key) {
        if (key === "$transaction") return work => target.$transaction(tx => work(failDecisionAudit(tx)));
        if (key === "organizationRequestAudit") return { create: async args => { if (args.data.action === "APPROVED") throw Error("Injected decision audit failure"); return target.organizationRequestAudit.create(args); } };
        const value = target[key]; return typeof value === "function" ? value.bind(target) : value;
      } });
    }
    const failing = createOrganizationService({ prisma: failDecisionAudit(db) });
    await assert.rejects(failing.decide(admin.id, sessions[2].id, r.id, decision), /Injected decision audit failure/);
    assert.equal((await db.organizationRequest.findUnique({ where: { id: r.id } })).status, "RECOMMENDED");
    assert.equal(await db.organization.count({ where: { requestId: r.id } }), 0);
    assert.equal(await db.organizationMembership.count({ where: { accountId: owner.id } }), 0);
    assert.equal(await db.organizationRequestAudit.count({ where: { requestId: r.id, action: "APPROVED" } }), 0);
    const results = await Promise.allSettled([service.decide(admin.id, sessions[2].id, r.id, decision), service.decide(admin.id, sessions[2].id, r.id, decision)]);
    assert.equal(results.filter(x => x.status === "fulfilled").length, 1); assert.equal(results.find(x => x.status === "rejected").reason.status, 409);
    const organizationId = results.find(x => x.status === "fulfilled").value.organizationId;
    const publicOrg = await service.publicOrganization(organizationId); assert.equal(publicOrg.verified, true); assert.equal(publicOrg.locations.length, 1); assert.equal(publicOrg.locations[0].countryCode, "GH");
    assert.equal(await db.organizationMembership.count({ where: { organizationId, accountId: owner.id, role: "PRIMARY_ADMIN", enabled: true } }), 1);
    assert.equal(await db.organizationRequestAudit.count({ where: { requestId: r.id, action: "APPROVED" } }), 1);
    assert.equal("finding" in await service.owner(owner.id, sessions[0].id, r.id), false);
    await db.organization.update({ where: { id: organizationId }, data: { status: "SUSPENDED" } });
    await assert.rejects(service.publicOrganization(organizationId), { status: 404 });
    assert.equal((await db.account.findUnique({ where: { id: owner.id } })).platformRole, "MEMBER");
  } finally {
    try {
      const ids = accounts.map(a => a.id), people = accounts.map(a => a.personId);
      if (ids.length) {
        const requests = await db.organizationRequest.findMany({ where: { applicantId: { in: ids } }, select: { id: true } }), requestIds = requests.map(r => r.id);
        const organizations = await db.organization.findMany({ where: { requestId: { in: requestIds } }, select: { id: true } }), orgIds = organizations.map(r => r.id);
        await db.organizationMembership.deleteMany({ where: { organizationId: { in: orgIds } } });
        await db.organizationOperatingLocation.deleteMany({ where: { organizationId: { in: orgIds } } });
        await db.organization.deleteMany({ where: { id: { in: orgIds } } });
        await db.organizationFinding.deleteMany({ where: { requestId: { in: requestIds } } });
        await db.organizationRequestAudit.deleteMany({ where: { requestId: { in: requestIds } } });
        await db.organizationRequest.deleteMany({ where: { id: { in: requestIds } } });
        await db.organizationOperatorAudit.deleteMany({ where: { targetAccountId: { in: ids } } });
        await db.organizationOperator.deleteMany({ where: { accountId: { in: ids } } });
        await db.session.deleteMany({ where: { accountId: { in: ids } } }); await db.mfaFactor.deleteMany({ where: { accountId: { in: ids } } });
        await db.account.deleteMany({ where: { id: { in: ids } } }); await db.person.deleteMany({ where: { id: { in: people } } });
      }
    } finally { await db.$disconnect(); }
  }
});
