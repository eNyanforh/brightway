import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { managementFixture } from "../test-support/management-fixture.js";
import { createManagementService } from "../src/modules/management/management-access.service.js";
import { createManagementRoutes } from "../src/modules/management/management.routes.js";
import { parseManagementCommand } from "../scripts/set-management-admin.js";
test("management provisioning requires a verified active MFA account and rejects injected grants", async () => {
  for (const change of [f => { f.state.account[0].status = "SUSPENDED"; }, f => { f.state.account[0].emailVerifiedAt = null; }, f => { f.state.mfaFactor.find(r => r.accountId === f.actors.owner.id).enabled = false; }]) {
    const f = managementFixture(); change(f); await assert.rejects(f.grant(), { status: 403 }); assert.equal(f.state.managementAdministrator.length, 0);
  }
  const f = managementFixture();
  await assert.rejects(f.provision({ username: "not_registered", action: "grant", reason: "Establish management access." }), { status: 404 });
  for (const extra of [{ enabled: true }, { force: true }, { platformRole: "SUPER_ADMIN" }]) await assert.rejects(f.provision({ username: f.actors.owner.username, action: "grant", reason: "Establish management access.", ...extra }), { status: 400 });
});
test("granting management is audited, retry-safe and preserves separately assigned reviewer/operator roles", async () => {
  const f = managementFixture(), actor = f.actors.owner;
  f.state.account[0].platformRole = "CREDENTIAL_REVIEWER";
  const first = await f.grant(), grantedAt = f.state.managementAdministrator[0].grantedAt; f.advance(1000); const again = await f.grant();
  assert.equal(first.changed, true); assert.equal(again.changed, false); assert.equal(f.state.managementAdministratorAudit.length, 1); assert.equal(+f.state.managementAdministrator[0].grantedAt, +grantedAt);
  assert.equal(f.state.account[0].platformRole, "CREDENTIAL_REVIEWER"); assert.equal(f.state.organizationOperator.some(r => r.accountId === actor.id), false);
  assert.equal(f.state.managementAdministratorAudit[0].actorSource, "SERVER_OPERATOR_CLI"); assert.equal(f.state.managementAdministratorAudit[0].toEnabled, true);
});
test("pre-grant sessions, stale factor versions and future/expired MFA cannot open management", async () => {
  const f = managementFixture(), a = f.actors.owner; f.advance(1000); await f.grant();
  assert.deepEqual(await f.management.access(a.id, a.sessionId), { allowed: false }); await assert.rejects(f.management.context(a.id, a.sessionId), { status: 403 });
  f.signIn(); assert.equal((await f.management.access(a.id, a.sessionId)).allowed, true);
  const session = f.state.session.find(s => s.id === a.sessionId); session.mfaVersion = 0; await assert.rejects(f.management.context(a.id, a.sessionId), { status: 403 });
  session.mfaVersion = 1; session.mfaVerifiedAt = new Date(+f.now() + 1000); await assert.rejects(f.management.context(a.id, a.sessionId), { status: 403 });
  session.mfaVerifiedAt = f.now(); session.expiresAt = f.now(); await assert.rejects(f.management.context(a.id, a.sessionId), { status: 403 });
});
test("last-eligible-admin protection serializes concurrent revocations and disabled accounts do not count as replacements", async () => {
  const f = managementFixture(); await f.grant(); await assert.rejects(f.revoke(f.actors.owner), { status: 409 }); await f.grant(f.actors.other);
  f.state.account.find(a => a.id === f.actors.other.id).status = "SUSPENDED"; await assert.rejects(f.revoke(f.actors.owner), { status: 409 });
  f.state.account.find(a => a.id === f.actors.other.id).status = "ACTIVE";
  const results = await Promise.allSettled([f.revoke(f.actors.owner), f.revoke(f.actors.other)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal(results.find(r => r.status === "rejected").reason.status, 409); assert.equal(f.state.managementAdministrator.filter(r => r.enabled).length, 1);
});
test("management context is private, own-account scoped and never invents operational review permissions", async () => {
  const f = managementFixture(); await f.grant(); f.signIn();
  const owner = f.actors.owner;
  f.db.manualIdentityReviewer = { findUnique: async () => null };
  const data = await f.management.context(owner.id, owner.sessionId);
  assert.equal(data.accountId, owner.id); assert.equal(data.role.label, "Management administrator"); assert.equal(data.tools.some(tool => tool.allowed), false);
  assert.equal(data.audits.length, 1); for (const secret of ["encryptedSecret", "passwordHash", "recoveryHashes", "storageKey", "emailVerifiedAt"]) assert(!JSON.stringify(data).includes(secret));
  assert.deepEqual(await f.management.access(f.actors.other.id, f.actors.other.sessionId), { allowed: false });
  f.state.account[0].platformRole = "CREDENTIAL_REVIEWER"; f.db.manualIdentityReviewer = { findUnique: async () => ({ enabled: true }) }; f.state.organizationOperator.push({ accountId: owner.id, agentEnabled: true, approverEnabled: false });
  const assigned = await f.management.context(owner.id, owner.sessionId); assert(assigned.tools.every(tool => tool.allowed)); assert.equal(assigned.permissions.organizationApprover, false);
  f.state.managementAdministrator[0].enabled = false; await assert.rejects(f.management.context(owner.id, owner.sessionId), { status: 403 });
});
test("audit failure rolls back a management grant and database outages never become successful access", async () => {
  const f = managementFixture(); f.db.managementAdministratorAudit.create = async () => { throw Error("Audit storage failure"); };
  await assert.rejects(f.grant(), /Audit storage failure/); assert.equal(f.state.managementAdministrator.length, 0);
  const service = createManagementService({ prisma: { async $transaction() { throw Error("Database unavailable"); } } }); await assert.rejects(service.access("account", "session"), /Database unavailable/);
});
test("management CLI validates all arguments before loading database configuration", () => {
  const parsed = parseManagementCommand(["OWNER_FIXTURE", "grant", "--reason", "Establish dedicated management account."]); assert.equal(parsed.username, "owner_fixture");
  for (const args of [[], ["owner", "grant"], ["owner", "grant", "--force", "Reason is long enough"], ["owner", "grant", "--reason", "short"], ["owner", "grant", "--reason", "Reason is long enough", "extra"]]) assert.throws(() => parseManagementCommand(args));
});
test("management HTTP uses the authenticated account, requires live MFA and has no web grant endpoint", async () => {
  const f = managementFixture(); await f.grant(); f.signIn(); f.db.manualIdentityReviewer = { findUnique: async () => null };
  let claimedMfa = true; const app = express(); app.use(express.json());
  app.use(createManagementRoutes({ management: f.management, sessions: { async authenticate(token) { const a = f.actors[token]; if (!a) throw Object.assign(Error("Sign in"), { status: 401 }); return { account: { id: a.id }, sessionId: a.sessionId, mfaVerified: claimedMfa }; } }, nodeEnv: "test", limiter: (r, s, n) => n() }));
  app.use((e, req, res, next) => { void next; res.status(e.status || 500).json({ success: false, message: e.message }); });
  const server = app.listen(0, "127.0.0.1"); await new Promise(r => server.once("listening", r)); const url = `http://127.0.0.1:${server.address().port}`;
  const get = (path, actor = "owner") => fetch(url + path, { headers: { Cookie: `brightway_session=${actor}` } });
  try {
    assert.equal((await fetch(url + "/management")).status, 401); assert.equal((await get("/management", "other")).status, 403);
    assert.equal((await (await get("/management/access", "other")).json()).data.allowed, false);
    const response = await get("/management"); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal((await response.json()).data.accountId, f.actors.owner.id);
    assert.equal((await get("/management?accountId=other")).status, 400); assert.equal((await fetch(url + "/management/grant", { method: "POST", headers: { Cookie: "brightway_session=owner", "Content-Type": "application/json" }, body: JSON.stringify({ username: "other_fixture", enabled: true }) })).status, 404);
    claimedMfa = false; assert.equal((await get("/management")).status, 403); claimedMfa = true; f.state.mfaFactor.find(r => r.accountId === f.actors.owner.id).enabled = false; assert.equal((await get("/management")).status, 403);
  } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
});
