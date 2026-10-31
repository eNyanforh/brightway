import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { readPlatformStatistics, statisticsPeriod } from "../src/modules/management/management-statistics.js";
import { createManagementService } from "../src/modules/management/management-access.service.js";
import { createManagementRoutes } from "../src/modules/management/management.routes.js";
import { managementFixture } from "../test-support/management-fixture.js";
const now = new Date("2026-10-30T12:00:00Z");
function counts() { return { accounts: { total: 0, active: 0, suspended: 0, deactivated: 0, emailVerified: 0, mfaEnabled: 0, newLast7Days: 0, signedInLast7Days: 0 }, organizations: { total: 0, active: 0, suspended: 0, schools: 0, companies: 0, ngos: 0 }, queues: { organizations: 0, identities: 0, credentials: 0 }, registrations: Array.from({ length: 30 }, (_, i) => ({ date: new Date(Date.parse(statisticsPeriod(now).from) + i * 86400000).toISOString().slice(0, 10), count: 0 })) }; }
test("platform aggregate is one bound statement, has 30 UTC buckets, preserves real zeros and reads no private documents", async () => {
  let calls = 0, statement, values;
  const db = { async $queryRaw(strings, ...bound) { calls++; statement = strings.join("?"); values = bound; return [{ statistics: counts() }]; } };
  const result = await readPlatformStatistics(db, now); assert.equal(calls, 1); assert.equal(result.asOf, now.toISOString()); assert.equal(result.registrations[0].date, "2026-10-01"); assert.equal(result.registrations.at(-1).date, "2026-10-30"); assert.equal(result.accounts.total, 0);
  assert(statement.includes("LEFT JOIN \"MfaFactor\"")); assert(!/"Person"|"passwordHash"|"email"|"username"|"encryptedSecret"|"recoveryHashes"|"CredentialEvidence"/.test(statement)); assert(values.every(v => /^2026-10-/.test(v)));
  assert.equal(statisticsPeriod(new Date("2027-01-01T00:00:00Z")).from, "2026-12-03T00:00:00.000Z");
});
test("invalid, inconsistent, unsafe or missing aggregate results fail instead of becoming a zero-count success", async () => {
  for (const change of [c => { c.accounts.total = -1; }, c => { c.accounts.total = 3; }, c => { c.accounts.emailVerified = 1; }, c => { c.accounts.active = Number.MAX_SAFE_INTEGER + 1; }, c => { c.organizations.total = 1; }, c => { c.registrations.pop(); }, c => { c.registrations[0].date = "2026-09-30"; }, c => { c.accounts.email = "private@example.invalid"; }]) {
    const data = counts(); change(data); await assert.rejects(readPlatformStatistics({ $queryRaw: async () => [{ statistics: data }] }, now), { status: 503 });
  }
  await assert.rejects(readPlatformStatistics({ $queryRaw: async () => [] }, now), { status: 503 });
  await assert.rejects(readPlatformStatistics({ $queryRaw: async () => { throw Error("Database unavailable"); } }, now), /Database unavailable/);
});
test("platform totals require current Super Admin authority and never run for ordinary management staff", async () => {
  const f = managementFixture(); await f.grant(); f.signIn(); let calls = 0;
  const service = createManagementService({ prisma: f.db, now: f.now, readStatistics: async () => { calls++; return { asOf: f.now().toISOString(), ...counts() }; } });
  const owner = f.actors.owner; assert.equal((await service.statistics(owner.id, owner.sessionId)).accountId, owner.id); assert.equal(calls, 1);
  f.state.managementAdministrator[0].isSuperAdmin = false; await assert.rejects(service.statistics(owner.id, owner.sessionId), { status: 403 }); assert.equal(calls, 1);
  f.state.managementAdministrator[0].isSuperAdmin = true; f.state.mfaFactor.find(r => r.accountId === owner.id).enabled = false;
  await assert.rejects(service.statistics(owner.id, owner.sessionId), { status: 403 }); assert.equal(calls, 1);
});
test("statistics recheck root version and MFA before returning a snapshot", async () => {
  for (const change of [f => { f.state.managementAdministrator[0].isSuperAdmin = false; }, f => { f.state.managementAdministrator[0].version++; }, f => { f.state.mfaFactor.find(r => r.accountId === f.actors.owner.id).version++; }]) {
    const f = managementFixture(); await f.grant(); f.signIn(); const service = createManagementService({ prisma: f.db, now: f.now, readStatistics: async () => { change(f); return counts(); } });
    await assert.rejects(service.statistics(f.actors.owner.id, f.actors.owner.sessionId), { status: 403 });
  }
});
test("statistics HTTP is uncached, authenticated and root-only, rejects query injection and sanitizes database failure", async () => {
  const f = managementFixture(); await f.grant(); f.signIn(); let unavailable = false;
  const management = createManagementService({ prisma: f.db, now: f.now, readStatistics: async () => { if (unavailable) throw Error("Sensitive database diagnostic"); return counts(); } });
  const app = express(); app.use(createManagementRoutes({ management, nodeEnv: "test", limiter: (r, s, n) => n(), sessions: { async authenticate(token) { if (token !== "owner") throw Object.assign(Error("Sign in"), { status: 401 }); return { account: { id: f.actors.owner.id }, sessionId: f.actors.owner.sessionId, mfaVerified: true }; } } })); app.use((e, r, s, n) => { void n; s.status(e.status || 500).json({ success: false, message: e.message }); });
  const server = app.listen(0, "127.0.0.1"); await new Promise(r => server.once("listening", r)); const base = `http://127.0.0.1:${server.address().port}/management/statistics`, get = suffix => fetch(base + (suffix || ""), { headers: { Cookie: "brightway_session=owner" } });
  try {
    assert.equal((await fetch(base)).status, 401); const success = await get(); assert.equal(success.status, 200); assert.equal(success.headers.get("cache-control"), "no-store"); assert.equal((await success.json()).data.accountId, f.actors.owner.id);
    assert.equal((await get("?accountId=other")).status, 400); assert.equal((await get("?days=99999")).status, 400);
    unavailable = true; const failed = await get(); assert.equal(failed.status, 503); assert(!JSON.stringify(await failed.json()).includes("Sensitive database"));
    f.state.managementAdministrator[0].isSuperAdmin = false; assert.equal((await get()).status, 403);
  } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
});
