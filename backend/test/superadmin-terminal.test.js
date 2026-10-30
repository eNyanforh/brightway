import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { managementFixture } from "../test-support/management-fixture.js";
import { mfaFixture } from "../test-support/mfa-fixture.js";
import { createStaffProvisioning } from "../src/modules/management/staff-provisioning.service.js";
import { createMfaService } from "../src/modules/auth/mfa.service.js";
import { parseSuperadminCommand, hiddenPrompt, withTerminalAuthentication } from "../scripts/superadmin.js";

const actor = a => ({ accountId: a.id, sessionId: a.sessionId });
const input = (a, capability = "organization-agent", action = "grant") => ({ username: a.username, capability, action, reason: "Assign authorized staff responsibility." });
test("first-root bootstrap is owner-bound, serialized and permanently closes after its audit", async () => {
  const f = managementFixture(), service = createStaffProvisioning({ prisma: f.db, now: f.now });
  await assert.rejects(service(input(f.actors.owner, "superadmin"), actor(f.actors.other), true), { status: 409 });
  const race = await Promise.allSettled([service(input(f.actors.owner, "superadmin"), actor(f.actors.owner), true), service(input(f.actors.other, "superadmin"), actor(f.actors.other), true)]);
  assert.equal(race.filter(r => r.status === "fulfilled").length, 1); assert.equal(f.state.managementAdministrator.filter(r => r.isSuperAdmin).length, 1);
  f.state.managementAdministrator[0].enabled = false; f.state.managementAdministrator[0].isSuperAdmin = false;
  await assert.rejects(service(input(f.actors.other, "superadmin"), actor(f.actors.other), true), { status: 409 });
});
test("only a live Super Admin with recent post-grant MFA can provision staff", async () => {
  const f = managementFixture(), service = createStaffProvisioning({ prisma: f.db, now: f.now }); await f.grant(); f.signIn();
  await assert.rejects(service(input(f.actors.other)), { status: 403 });
  await assert.rejects(service(input(f.actors.other), actor(f.actors.other)), { status: 403 });
  f.advance(300001); await assert.rejects(service(input(f.actors.other), actor(f.actors.owner)), { status: 403 }); f.signIn();
  f.state.mfaFactor.find(r => r.accountId === f.actors.owner.id).version++;
  await assert.rejects(service(input(f.actors.other), actor(f.actors.owner)), { status: 403 });
  assert.equal(f.state.organizationOperator.some(r => r.accountId === f.actors.other.id), false);
});
test("terminal staff grants remain granular, retry-safe, attributable and revoke portal access with the final capability", async () => {
  const f = managementFixture(), root = f.actors.owner, target = f.actors.other, service = createStaffProvisioning({ prisma: f.db, now: f.now }); await f.grant(); f.signIn();
  for (const capability of ["organization-agent", "organization-approver", "credential-reviewer", "identity-reviewer"]) {
    const first = await service(input(target, capability), actor(root)); assert.equal(first.changed, true);
    assert.equal((await service(input(target, capability), actor(root))).changed, false);
  }
  f.signIn(target); const context = await f.management.context(target.id, target.sessionId);
  assert.equal(context.role.label, "Management staff"); assert.equal(context.role.isSuperAdmin, false); assert(context.tools.every(t => t.allowed));
  await assert.rejects(service(input(target, "superadmin"), actor(target)), { status: 403 });
  assert.equal(f.state.reviewerRoleAudit[0].actor, root.id); assert.equal(f.state.manualIdentityAudit[0].actorId, root.id);
  const audits = f.state.managementAdministratorAudit.filter(r => r.targetAccountId === target.id); assert.equal(audits.length, 4); assert(audits.every(r => r.actorAccountId === root.id && r.actorSource === "SUPERADMIN_TERMINAL"));
  for (const capability of ["organization-agent", "organization-approver", "credential-reviewer", "identity-reviewer"]) await service(input(target, capability, "revoke"), actor(root));
  assert.equal(f.state.managementAdministrator.find(r => r.accountId === target.id).enabled, false);
  await assert.rejects(f.management.context(target.id, target.sessionId), { status: 403 });
});
test("target prerequisites and atomic audit failures cannot produce a partial staff grant", async () => {
  const f = managementFixture(), target = f.actors.other, service = createStaffProvisioning({ prisma: f.db, now: f.now }); await f.grant(); f.signIn();
  const factor = f.state.mfaFactor.find(r => r.accountId === target.id); factor.enabled = false;
  await assert.rejects(service(input(target), actor(f.actors.owner)), { status: 403 }); f.state.mfaFactor.find(r => r.accountId === target.id).enabled = true;
  f.db.managementAdministratorAudit.create = async () => { throw Error("Audit unavailable"); };
  await assert.rejects(service(input(target, "credential-reviewer"), actor(f.actors.owner)), /Audit unavailable/);
  assert.equal(f.state.account.find(r => r.id === target.id).platformRole, "MEMBER"); assert.equal(f.state.reviewerRoleAudit.length, 0); assert.equal(f.state.managementAdministrator.some(r => r.accountId === target.id), false);
});
test("terminal parser accepts only explicit bootstrap or attributed supported role operations", async () => {
  assert.equal(parseSuperadminCommand(["bootstrap", "FOUNDER", "--reason", "Establish first Super Admin."]).actorUsername, "founder");
  assert.equal(parseSuperadminCommand(["staff", "reviewer", "identity-reviewer", "grant", "--by", "founder", "--reason", "Assign identity reviews."]).input.capability, "identity-reviewer");
  for (const args of [[], ["bootstrap", "founder", "--reason", "short"], ["bootstrap", "founder", "--force", "Establish first Super Admin."], ["staff", "reviewer", "support", "grant", "--by", "founder", "--reason", "Unsupported future role."], ["staff", "reviewer", "identity-reviewer", "grant", "--password", "secret", "--reason", "Do not pass credentials."]]) assert.throws(() => parseSuperadminCommand(args));
  await assert.rejects(hiddenPrompt("Hidden", { input: { isTTY: false }, output: { isTTY: false } }), /interactive terminal/);
});
test("terminal authentication uses actual MFA, persists wrong-code attempts and deletes temporary sessions/challenges", async () => {
  const f = mfaFixture(), enrolled = await f.enroll(); f.advance(30000);
  const mfa = createMfaService({ ...f.options, sessionLifetimeMs: 300000 }), before = f.state.session.length;
  let prompts = 0;
  const result = await withTerminalAuthentication({ prisma: f.db, sessions: f.sessions, mfa, username: "tester", prompt: async () => ++prompts === 1 ? "correct password" : f.currentCode(enrolled.secret) }, async operator => {
    const session = f.state.session.find(r => r.id === operator.sessionId); assert.equal(+session.expiresAt - +f.now(), 300000); assert.equal(session.accountId, "account"); return "authorized command";
  });
  assert.equal(result, "authorized command"); assert.equal(f.state.session.length, before); assert.equal(f.state.mfaLoginChallenge.length, 0);
  prompts = 0; await assert.rejects(withTerminalAuthentication({ prisma: f.db, sessions: f.sessions, mfa, username: "tester", prompt: async () => ++prompts === 1 ? "correct password" : "bad-proof" }, async () => assert.fail("Wrong proof must never provision")), { status: 401 });
  assert.equal(f.state.mfaFactor[0].failureCount, 1); assert.equal(f.state.mfaLoginChallenge.length, 0); assert.equal(f.state.session.length, before);
  f.advance(30000); prompts = 0;
  await assert.rejects(withTerminalAuthentication({ prisma: f.db, sessions: f.sessions, mfa, username: "tester", prompt: async () => ++prompts === 1 ? "correct password" : f.currentCode(enrolled.secret) }, async () => { throw Error("Command failed"); }), /Command failed/);
  assert.equal(f.state.session.length, before); assert.equal(f.state.mfaLoginChallenge.length, 0);
});
test("retired direct-grant commands fail closed without importing database configuration", () => {
  for (const file of ["set-management-admin", "set-credential-reviewer", "set-identity-reviewer", "set-organization-operator"]) {
    const result = spawnSync(process.execPath, [new URL(`../scripts/${file}.js`, import.meta.url).pathname, "target", "grant"], { encoding: "utf8", env: { ...process.env, DATABASE_URL: "", DIRECT_URL: "" } });
    assert.equal(result.status, 1); assert.match(result.stderr, /retired/); assert(!result.stderr.includes("Prisma"));
  }
});
