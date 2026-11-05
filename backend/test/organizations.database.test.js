import { managementStaffFixture, managementSessionFixture, cleanupManagementFixtures } from "../test-support/management-database-fixture.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { tokenHash } from "../src/modules/auth/session.service.js";
import { managementTokenHash } from "../src/modules/management/management-auth.service.js";
import { createOrganizationService } from "../src/modules/organizations/organization.service.js";

test("database organization submission/decision races, separate roles and failed audits preserve one organization and primary administrator", {
  skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database",
}, async t => {
  const { PrismaClient } = await import("@prisma/client"), { PrismaPg } = await import("@prisma/adapter-pg");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }), transactionOptions: { maxWait: 10000, timeout: 15000 } });
  const marker = randomUUID(), accounts = [], sessions = [], now = new Date();
  const service = createOrganizationService({ prisma: db });
  try {
    for (const label of ["owner", "agent", "admin", "next"]) {
      const account = label === "owner" ? await db.account.create({ data: { username: `org_${label}_${marker.replaceAll("-", "").slice(0, 16)}`, email: `org_${label}_${marker}@example.invalid`, passwordHash: "synthetic-unusable-hash", emailVerifiedAt: now, person: { create: { firstName: "Synthetic", lastName: label } } } }) : await managementStaffFixture(db, { username: `internal_${label}_${marker.replaceAll("-", "").slice(0, 12)}`, email: `internal_${label}_${marker}@example.invalid` }, [label === "agent" || label === "next" ? "organization-agent" : "organization-approver"], now); accounts.push(account);
      sessions.push(label === "owner" ? await db.session.create({ data: { accountId: account.id, tokenHash: randomUUID(), expiresAt: new Date(+now + 86400000) } }) : await managementSessionFixture(db, account, now));
    }
    const [owner, agent, admin, replacement] = accounts;
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
    await db.managementStaff.update({ where: { id: agent.id }, data: { capabilities: ["organization-agent", "organization-approver"] } });
    await assert.rejects(service.decide(agent.id, sessions[1].id, r.id, decision), { status: 403 });
    await db.managementStaff.update({ where: { id: agent.id }, data: { capabilities: ["organization-approver"] } });
    await assert.rejects(service.decide(admin.id, sessions[2].id, r.id, decision), { status: 409 });
    await db.managementStaff.update({ where: { id: agent.id }, data: { capabilities: ["organization-agent", "organization-approver"] } });
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
    await t.test("the approved representative enters their workspace and setup assistance stays with the reviewers", async () => {
      process.env.NODE_ENV = "test";
      process.env.CLIENT_URL = "http://localhost:5173";
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
      const { default: app } = await import("../src/app.js");
      const { prisma } = await import("../src/config/database.js");
      const personalToken = randomBytes(32).toString("hex");
      const managementToken = randomBytes(32).toString("hex");
      await db.session.update({ where: { id: sessions[0].id }, data: { tokenHash: tokenHash(personalToken) } });
      await db.managementSession.update({ where: { id: sessions[2].id }, data: { tokenHash: managementTokenHash(managementToken) } });
      const server = app.listen(0, "127.0.0.1");
      await new Promise(resolve => server.once("listening", resolve));
      const base = "http://127.0.0.1:" + server.address().port + "/api/v1";
      const applicantCookie = "brightway_session=" + personalToken;
      const approverCookie = "brightway-management=" + managementToken;
      const get = async (path, cookie, status = 200) => {
        const response = await fetch(base + path, { headers: cookie ? { Cookie: cookie } : {} });
        assert.equal(response.status, status, path);
        return (await response.json()).data;
      };
      try {
        const publicPage = await get("/organizations/" + organizationId);
        assert.equal(publicPage.verified, true);
        const ownerRequest = await get("/organization-requests/" + r.id, applicantCookie);
        assert.equal(ownerRequest.organizationId, organizationId);
        assert.equal(ownerRequest.userRole, "PRIMARY_ADMIN");
        assert.equal(ownerRequest.workspaceAvailable, true);
        for (const view of [publicPage, ownerRequest]) {
          assert.equal(Object.hasOwn(view, "finding"), false);
          assert.equal(JSON.stringify(view).includes(finding.setupAssistance), false);
          assert.equal(JSON.stringify(view).includes(finding.notes), false);
        }
        const approved = await get("/my-workspace?tab=approved", applicantCookie);
        assert.equal(approved.items.find(item => item.id === organizationId)?.role, "PRIMARY_ADMIN");
        const workspace = await get("/organization-workspace/" + organizationId, applicantCookie);
        assert.equal(workspace.membership.role, "PRIMARY_ADMIN");
        assert.equal(workspace.setupRequired, true);
        await get("/admin/organizations/" + r.id, applicantCookie, 401);
        const review = await get("/admin/organizations/" + r.id, approverCookie);
        assert.equal(review.finding.setupAssistance, finding.setupAssistance);
        await get("/organization-requests/" + r.id, approverCookie, 401);
      } finally {
        await new Promise(resolve => server.close(resolve));
        await prisma.$disconnect();
      }
    });
    await db.organization.update({ where: { id: organizationId }, data: { status: "SUSPENDED" } });
    await assert.rejects(service.publicOrganization(organizationId), { status: 404 });
    assert.equal((await db.account.findUnique({ where: { id: owner.id } })).platformRole, "MEMBER");
    // Permanently retire an investigator after recommendation; no permission restoration is needed.
    const second = await service.submit(owner.id, sessions[0].id, { ...input, name: `Replacement flow ${marker}`, idempotencyKey: randomUUID() });
    const assignedSecond = await service.assign(admin.id, sessions[2].id, second.id, { expectedVersion: second.version, agentUsername: agent.username });
    const oldRecommendation = await service.report(agent.id, sessions[1].id, second.id, { ...finding, expectedVersion: assignedSecond.version });
    const oldFinding = await db.organizationFinding.findUnique({ where: { requestId: second.id } });
    await db.managementStaff.update({ where: { id: agent.id }, data: { capabilities: ["organization-approver"] } });
    const blocked = await service.detail(admin.id, sessions[2].id, second.id); assert.equal(blocked.requiresReassignment, true); assert.equal(blocked.canDecide, false);
    await assert.rejects(service.decide(admin.id, sessions[2].id, second.id, { ...decision, expectedVersion: oldRecommendation.version }), { status: 409 });
    const replace = { expectedVersion: oldRecommendation.version, agentUsername: replacement.username };
    const failReassignment = new Proxy(db, { get(target, key) {
      if (key === "$transaction") return work => target.$transaction(tx => work(new Proxy(tx, { get(client, field) {
        if (field === "organizationRequestAudit") return { create: async args => { if (args.data.action === "REASSIGNED") throw Error("Injected reassignment audit failure"); return client.organizationRequestAudit.create(args); } };
        const value = client[field]; return typeof value === "function" ? value.bind(client) : value;
      } })));
      const value = target[key]; return typeof value === "function" ? value.bind(target) : value;
    } });
    await assert.rejects(createOrganizationService({ prisma: failReassignment }).assign(admin.id, sessions[2].id, second.id, replace), /Injected reassignment audit failure/);
    assert.deepEqual(await db.organizationFinding.findUnique({ where: { requestId: second.id } }), oldFinding);
    assert.equal(await db.organizationFindingArchive.count({ where: { requestId: second.id } }), 0);
    assert.equal((await db.organizationRequest.findUnique({ where: { id: second.id } })).status, "RECOMMENDED");
    const replacements = await Promise.allSettled([service.assign(admin.id, sessions[2].id, second.id, replace), service.assign(admin.id, sessions[2].id, second.id, replace)]);
    assert.equal(replacements.filter(x => x.status === "fulfilled").length, 1); assert.equal(replacements.find(x => x.status === "rejected").reason.status, 409);
    const reassigned = replacements.find(x => x.status === "fulfilled").value;
    const history = await db.organizationFindingArchive.findMany({ where: { requestId: second.id } }); assert.equal(history.length, 1);
    for (const field of Object.keys(oldFinding)) assert.deepEqual(history[0][field], oldFinding[field]);
    assert.equal(history[0].sourceVersion, oldRecommendation.version); assert.equal(history[0].retiredById, admin.id);
    assert.equal(await db.organizationFinding.findUnique({ where: { requestId: second.id } }), null);
    assert.equal(+(await db.organizationRequest.findUnique({ where: { id: second.id } })).targetAt, +second.targetAt);
    await assert.rejects(service.report(replacement.id, sessions[3].id, second.id, { ...finding, expectedVersion: oldRecommendation.version }), { status: 409 });
    await assert.rejects(service.decide(admin.id, sessions[2].id, second.id, { ...decision, expectedVersion: reassigned.version }), { status: 409 });
    const freshView = await service.detail(replacement.id, sessions[3].id, second.id); assert.equal(freshView.canReport, true); assert.deepEqual(freshView.findingHistory, []);
    assert.equal("findingHistory" in await service.owner(owner.id, sessions[0].id, second.id), false);
    const fresh = await service.report(replacement.id, sessions[3].id, second.id, { ...finding, expectedVersion: reassigned.version, notes: "Fresh independent replacement investigation." });
    const finalBody = { ...decision, expectedVersion: fresh.version };
    // The former investigator retains an approver role, but history must still forbid their decision.
    assert.equal((await service.detail(agent.id, sessions[1].id, second.id)).canDecide, false);
    await assert.rejects(service.decide(agent.id, sessions[1].id, second.id, finalBody), { status: 403 });
    await assert.rejects(service.decide(admin.id, sessions[2].id, second.id, { ...decision, expectedVersion: oldRecommendation.version }), { status: 409 });
    const approvedAfterReplacement = await service.decide(admin.id, sessions[2].id, second.id, finalBody);
    assert.equal((await service.publicOrganization(approvedAfterReplacement.organizationId)).verified, true);
    assert.equal(await db.organization.count({ where: { requestId: second.id } }), 1);
    assert.equal(await db.organizationMembership.count({ where: { organizationId: approvedAfterReplacement.organizationId, enabled: true } }), 1);
    assert.equal(await db.organizationRequestAudit.count({ where: { requestId: second.id, action: "REASSIGNED" } }), 1);
    assert.equal((await db.managementStaff.findUnique({ where: { id: agent.id } })).capabilities.includes("organization-agent"), false);

  } finally {
    try {
      const ids = accounts.map(a => a.id), people = accounts.map(a => a.personId).filter(Boolean);
      if (ids.length) {
        const requests = await db.organizationRequest.findMany({ where: { applicantId: { in: ids } }, select: { id: true } }), requestIds = requests.map(r => r.id);
        const organizations = await db.organization.findMany({ where: { requestId: { in: requestIds } }, select: { id: true } }), orgIds = organizations.map(r => r.id);
        await db.organizationMembership.deleteMany({ where: { organizationId: { in: orgIds } } });
        await db.organizationOperatingLocation.deleteMany({ where: { organizationId: { in: orgIds } } });
        await db.organization.deleteMany({ where: { id: { in: orgIds } } });
        await db.organizationFindingArchive.deleteMany({ where: { requestId: { in: requestIds } } });
        await db.organizationFinding.deleteMany({ where: { requestId: { in: requestIds } } });
        await db.organizationRequestAudit.deleteMany({ where: { requestId: { in: requestIds } } });
        await db.organizationRequest.deleteMany({ where: { id: { in: requestIds } } });
        await db.organizationOperatorAudit.deleteMany({ where: { targetAccountId: { in: ids } } });
        await db.organizationOperator.deleteMany({ where: { accountId: { in: ids } } });
        await cleanupManagementFixtures(db, ids); await db.session.deleteMany({ where: { accountId: { in: ids } } }); await db.mfaFactor.deleteMany({ where: { accountId: { in: ids } } });
        await db.account.deleteMany({ where: { id: { in: ids } } }); await db.person.deleteMany({ where: { id: { in: people } } });
      }
    } finally { await db.$disconnect(); }
  }
});
