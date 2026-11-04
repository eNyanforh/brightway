import test from "node:test";
import assert from "node:assert/strict";
import { managementAuthFixture } from "../test-support/management-auth-fixture.js";
import { createManagementService } from "../src/modules/management/management-access.service.js";
import { assertNoSelfReview, managementPermission, conflictAccounts } from "../src/modules/management/management-authority.js";
import { randomUUID } from "node:crypto";
test("Super Admin automatically receives every implemented tool while ordinary staff receive only their capabilities", async () => {
  const f = managementAuthFixture(), root = await f.enroll(), service = createManagementService({ prisma: f.db, now: f.now });
  const context = await service.context(root.staff.id, root.actor.sessionId); assert.equal(context.staffId, root.staff.id); assert(context.tools.every(tool => tool.allowed)); assert.equal(context.accountId, undefined);
  const staff = await f.enroll("agent_staff", root.actor); let page = await service.context(staff.staff.id, staff.actor.sessionId); assert(page.tools.every(tool => !tool.allowed));
  await f.provisioner.change({ username: "agent_staff", capability: "organization-agent", enabled: true, reason: "Authorize only organization investigations." }, root.actor);
  await assert.rejects(service.context(staff.staff.id, staff.actor.sessionId), { status: 403 });
  const signed = await f.signIn("agent_staff", staff.secret), current = await f.auth.authenticate(signed.token);
  page = await service.context(staff.staff.id, current.sessionId); assert.deepEqual(page.tools.filter(tool => tool.allowed).map(tool => tool.key), ["organizations"]);
  await assert.rejects(managementPermission(f.db, staff.staff.id, "identity-reviewer"), { status: 403 });
});
test("historical personal reviewer/root grants cannot authorize management services", async () => {
  const f = managementAuthFixture(), owner = f.actors.owner, service = createManagementService({ prisma: f.db, now: f.now });
  f.state.account[0].platformRole = "CREDENTIAL_REVIEWER"; f.state.managementAdministrator.push({ accountId: owner.id, enabled: true, isSuperAdmin: true, grantedAt: f.now(), version: 1 });
  f.state.manualIdentityReviewer.push({ accountId: owner.id, enabled: true });
  await assert.rejects(service.context(owner.id, owner.sessionId), { status: 403 });
  await assert.rejects(managementPermission(f.db, owner.id, "credential-reviewer"), { status: 403 });
});
test("bootstrap races have one winner, create no personal account and remain closed after the first root is disabled", async () => {
  const f = managementAuthFixture(), before = f.state.account.length;
  const results = await Promise.allSettled([f.provisioner.create(f.input("root_one"), null, true), f.provisioner.create(f.input("root_two"), null, true)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal(f.state.account.length, before);
  f.state.managementStaff[0].status = "DISABLED";
  await assert.rejects(f.provisioner.create(f.input("root_three"), null, true), { status: 409 });
});
test("new staff provisioning requires a current root and fresh management MFA; audit failure leaves no partial identity", async () => {
  const f = managementAuthFixture(), root = await f.enroll();
  const staff = await f.enroll("ordinary_staff", root.actor);
  await assert.rejects(f.provisioner.create(f.input("another_staff"), staff.actor), { status: 403 });
  await assert.rejects(f.provisioner.create(f.input("another_staff"), { staffId: root.staff.id, sessionId: f.actors.owner.sessionId }), { status: 403 });
  const save = f.db.managementStaffAudit.create; f.db.managementStaffAudit.create = async () => { throw Error("Audit write failed"); };
  await assert.rejects(f.provisioner.create(f.input("another_staff"), root.actor), /Audit write failed/); assert(!f.state.managementStaff.some(row => row.username === "another_staff"));
  f.db.managementStaffAudit.create = save; f.advance(300001); await assert.rejects(f.provisioner.create(f.input("another_staff"), root.actor), { status: 403 });
});
test("last active root is protected, and staff revocation invalidates sessions and challenges without altering personal accounts", async () => {
  const f = managementAuthFixture(), root = await f.enroll(), before = structuredClone(f.state.account);
  const change = { username: "root", capability: "superadmin", enabled: false, reason: "Attempting final root permission removal." };
  await assert.rejects(f.provisioner.change(change, root.actor), { status: 409 });
  const backup = await f.enroll("backup_root", root.actor);
  await f.provisioner.change({ username: "backup_root", capability: "superadmin", enabled: true, reason: "Establish separately secured backup root." }, root.actor);
  const signed = await f.signIn("backup_root", backup.secret), auth = await f.auth.authenticate(signed.token);
  await f.provisioner.change(change, { staffId: backup.staff.id, sessionId: auth.sessionId });
  await assert.rejects(f.auth.authenticate(root.token), { status: 401 }); assert.deepEqual(f.state.account, before);
});
test("same-email and explicit conflict declarations block cross-realm self review even for Super Admin", async () => {
  const f = managementAuthFixture(), root = await f.enroll(), owner = f.state.account[0];
  owner.email = "root@management.example.invalid"; assert((await conflictAccounts(f.db, root.staff.id)).includes(owner.id));
  await assert.rejects(assertNoSelfReview(f.db, root.staff.id, owner.id), { status: 403 });
  const other = f.state.account.find(row => row.id === f.actors.other.id); other.email = "different@example.invalid";
  await f.auth.declareConflict(root.staff.id, root.actor.sessionId, { username: other.username, reason: "This is another account I own personally." });
  await assert.rejects(assertNoSelfReview(f.db, root.staff.id, other.id), { status: 403 });
  assert(f.state.managementStaffAudit.some(row => row.action === "CONFLICT_DECLARED"));
});
test("foreign, expired and stale management sessions cannot read private management context", async () => {
  const f = managementAuthFixture(), root = await f.enroll(), service = createManagementService({ prisma: f.db, now: f.now });
  for (const sid of [undefined, "", randomUUID()]) await assert.rejects(service.context(root.staff.id, sid), { status: 403 });
  f.state.managementSession[0].expiresAt = f.now(); await assert.rejects(service.context(root.staff.id, root.actor.sessionId), { status: 403 });
});

test("provisioning a new staff identity holds the root lock and a stale permission update cannot create a false success audit", async () => {
  const f = managementAuthFixture(), root = await f.enroll();
  const original = f.db.managementStaff.updateMany.bind(f.db.managementStaff), locks = [];
  f.db.managementStaff.updateMany = async args => { if (args.data.failureCount) locks.push(args.where.id); return original(args); };
  const child = await f.provisioner.create({ username: "pending_staff", fullName: "Pending staff", email: "pending@management.example.invalid", passwordHash: "scrypt$synthetic", reason: "Explicit independent staff provisioning." }, root.actor);
  assert(locks.includes(root.actor.staffId));
  const audits = f.state.managementStaffAudit.length;
  f.db.managementStaff.updateMany = async args => args.where.id === child.id && args.where.version !== undefined ? { count: 0 } : original(args);
  await assert.rejects(f.provisioner.change({ username: child.username, capability: "identity-reviewer", enabled: true, reason: "An enrollment race must not produce a successful permission audit." }, root.actor), { status: 409 });
  assert.equal(f.state.managementStaffAudit.length, audits);
});
