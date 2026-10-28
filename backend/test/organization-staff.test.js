import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { organizationFixture } from "../test-support/organization-fixture.js";
import { createOrganizationStaffService } from "../src/modules/organizations/organization-staff.service.js";
import { createOrganizationStaffRoutes } from "../src/modules/organizations/organization-staff.routes.js";
const MANAGE = "organization.members.manage", POSTS = "organization.posts.publish";
async function fixture() {
  const f = organizationFixture(), result = await f.decide(await f.report(await f.assign(await f.submit()))), owner = f.actors.owner, recipient = f.actors.other;
  f.state.mfaFactor.push({ accountId: owner.id, enabled: true, version: 1 }); Object.assign(f.state.session.find(r => r.id === owner.sessionId), { mfaVersion: 1, mfaVerifiedAt: f.now() });
  const staff = createOrganizationStaffService({ prisma: f.db, now: f.now }), id = result.organizationId;
  return { ...f, staff, id, owner, recipient, context: () => staff.context(owner.id, owner.sessionId, id), invite: async (permissions = [POSTS], username = recipient.username, extra = {}) => staff.invite(owner.id, owner.sessionId, id, { expectedStaffVersion: f.state.organization[0].staffVersion, idempotencyKey: randomUUID(), username, permissions, ...extra }), accept: r => staff.respond(recipient.id, recipient.sessionId, r.id, { expectedVersion: r.version, decision: "ACCEPT" }) };
}
test("staff context requires live membership and verified active organization, without granting Campus or internal BrightWay roles", async () => {
  const f = await fixture(), c = await f.context(); assert(c.permissions.includes(MANAGE)); assert(!c.permissions.some(p => /campus|internal/.test(p))); assert(c.permissions.includes("organization.credentials.education.review")); assert.equal(c.organization.id, f.id);
  await assert.rejects(f.staff.context(f.recipient.id, f.recipient.sessionId, f.id), { status: 403 });
  await assert.rejects(f.staff.context(f.owner.id, undefined, f.id), { status: 401 });
  f.state.organization[0].status = "SUSPENDED"; await assert.rejects(f.context(), { status: 404 });
});
test("invitation is body-bound, retry-safe and does not grant membership before recipient consent", async () => {
  const f = await fixture(), key = randomUUID(); const r = await f.invite([POSTS], f.recipient.username, { idempotencyKey: key });
  const duplicate = await f.invite([POSTS], f.recipient.username, { idempotencyKey: key, expectedStaffVersion: 1 }); assert.equal(r.id, duplicate.id);
  await assert.rejects(f.invite([], f.recipient.username, { idempotencyKey: key }), { status: 409 });
  assert.equal(f.state.organizationMembership.length, 1); assert.equal((await f.staff.home(f.recipient.id, f.recipient.sessionId)).invitations.length, 1);
  const accepted = await f.accept(r); assert.equal(accepted.state, "ACCEPTED"); await assert.rejects(f.accept(r), { status: 409 });
  assert.deepEqual((await f.staff.context(f.recipient.id, f.recipient.sessionId, f.id)).permissions, [POSTS]); assert.equal(f.state.organizationMembership.length, 2);
});
test("foreign recipients, expired/declined/cancelled invitations cannot authorize acceptance", async () => {
  for (const mode of ["foreign", "expired", "declined", "cancelled"]) {
    const f = await fixture(), r = await f.invite();
    if (mode === "foreign") await assert.rejects(f.staff.respond(f.owner.id, f.owner.sessionId, r.id, { expectedVersion: r.version, decision: "ACCEPT" }), { status: 404 });
    else {
      if (mode === "expired") { f.advance(8 * 86400000); f.state.session.find(s => s.id === f.recipient.sessionId).expiresAt = new Date(+f.now() + 86400000); }
      if (mode === "declined") await f.staff.respond(f.recipient.id, f.recipient.sessionId, r.id, { expectedVersion: r.version, decision: "DECLINE" });
      if (mode === "cancelled") await f.staff.cancel(f.owner.id, f.owner.sessionId, f.id, r.id, { expectedVersion: r.version, expectedStaffVersion: 2 });
      await assert.rejects(f.accept(r), { status: 409 });
    }
    assert.equal(f.state.organizationMembership.length, 1);
  }
});
test("permission changes and revocation are versioned and primary administrator cannot be removed", async () => {
  const f = await fixture(); await f.accept(await f.invite()); const member = f.state.organizationMembership.find(m => m.accountId === f.recipient.id), primary = f.state.organizationMembership[0];
  await assert.rejects(f.staff.change(f.owner.id, f.owner.sessionId, f.id, primary.id, { expectedStaffVersion: 3, expectedVersion: 1, permissions: [], enabled: false }), { status: 409 });
  await f.staff.change(f.owner.id, f.owner.sessionId, f.id, member.id, { expectedStaffVersion: 3, expectedVersion: 1, permissions: [], enabled: false });
  await assert.rejects(f.staff.context(f.recipient.id, f.recipient.sessionId, f.id), { status: 403 }); assert.equal((await f.staff.home(f.recipient.id, f.recipient.sessionId)).organizations.length, 0);
  await assert.rejects(f.staff.change(f.owner.id, f.owner.sessionId, f.id, member.id, { expectedStaffVersion: 3, expectedVersion: 1, permissions: [POSTS], enabled: true }), { status: 409 });
});
test("delegated staff cannot grant or manage authority they do not hold; only authorized MFA managers see staff", async () => {
  const f = await fixture(); await f.accept(await f.invite([MANAGE]));
  await assert.rejects(f.staff.staff(f.recipient.id, f.recipient.sessionId, f.id), { status: 403 });
  f.state.mfaFactor.push({ accountId: f.recipient.id, enabled: true, version: 1 }); Object.assign(f.state.session.find(s => s.id === f.recipient.sessionId), { mfaVersion: 1, mfaVerifiedAt: f.now() });
  await assert.rejects(f.staff.invite(f.recipient.id, f.recipient.sessionId, f.id, { expectedStaffVersion: 3, idempotencyKey: randomUUID(), username: f.actors.agent.username, permissions: [POSTS] }), { status: 403 });
  assert.equal((await f.staff.staff(f.recipient.id, f.recipient.sessionId, f.id)).members.length, 2);
  const raw = f.state.organizationMembership.find(m => m.accountId === f.recipient.id); raw.enabled = false;
  await assert.rejects(f.staff.staff(f.recipient.id, f.recipient.sessionId, f.id), { status: 403 });
});
test("current inviter authority is rechecked at acceptance and suspended organizations fail closed", async () => {
  const f = await fixture(); await f.accept(await f.invite([MANAGE, POSTS]));
  const recipient = f.actors.agent, sender = f.recipient; f.state.mfaFactor.push({ accountId: sender.id, enabled: true, version: 1 }); Object.assign(f.state.session.find(s => s.id === sender.sessionId), { mfaVersion: 1, mfaVerifiedAt: f.now() });
  const invite = await f.staff.invite(sender.id, sender.sessionId, f.id, { expectedStaffVersion: 3, idempotencyKey: randomUUID(), username: recipient.username, permissions: [POSTS] });
  const membership = f.state.organizationMembership.find(m => m.accountId === sender.id);
  await f.staff.change(f.owner.id, f.owner.sessionId, f.id, membership.id, { expectedStaffVersion: 4, expectedVersion: membership.version, permissions: [MANAGE], enabled: true });
  await assert.rejects(f.staff.respond(recipient.id, recipient.sessionId, invite.id, { expectedVersion: 1, decision: "ACCEPT" }), { status: 409 });
  assert.equal(f.state.organizationMembership.filter(m => m.accountId === recipient.id).length, 0);
});
test("audit failure rolls invitation acceptance and permission changes back atomically", async () => {
  const f = await fixture(), r = await f.invite(); f.failAudit(); await assert.rejects(f.accept(r), /Audit failed/);
  assert.equal(f.state.organizationMembership.length, 1); assert.equal(f.state.organizationInvitation[0].state, "PENDING"); f.failAudit(false); await f.accept(r);
  const m = f.state.organizationMembership.find(m => m.accountId === f.recipient.id); f.failAudit();
  await assert.rejects(f.staff.change(f.owner.id, f.owner.sessionId, f.id, m.id, { expectedStaffVersion: 3, expectedVersion: 1, permissions: [], enabled: false }), /Audit failed/); assert.equal(f.state.organizationMembership.find(x => x.id === m.id).enabled, true);
});
test("concurrent invitation acceptance and staffing edits have one winner", async () => {
  const f = await fixture(), r = await f.invite(); const results = await Promise.allSettled([f.accept(r), f.accept(r)]); assert.equal(results.filter(x => x.status === "fulfilled").length, 1);
  const m = f.state.organizationMembership.find(m => m.accountId === f.recipient.id), body = { expectedStaffVersion: 3, expectedVersion: 1, permissions: [], enabled: true };
  const updates = await Promise.allSettled([f.staff.change(f.owner.id, f.owner.sessionId, f.id, m.id, body), f.staff.change(f.owner.id, f.owner.sessionId, f.id, m.id, body)]); assert.equal(updates.filter(x => x.status === "fulfilled").length, 1);
});
test("strict permissions reject injected roles, trust, ownership, duplicates and Campus scope", async () => {
  const f = await fixture(); for (const extra of [{ role: "PRIMARY_ADMIN" }, { actorId: f.recipient.id }, { identityVerified: true }, { organizationId: f.id }]) await assert.rejects(f.invite([POSTS], f.recipient.username, extra), { status: 400 });
  for (const permissions of [["campus.billing.view"], [POSTS, POSTS], ["organization.credentials.identity.review"]]) await assert.rejects(f.invite(permissions), { status: 400 });
  f.state.organization[0].offersTraining = false; await assert.rejects(f.invite(["organization.programs.manage"]), { status: 403 });
});
test("tenant-bound paging never accepts another account or organization's cursor", async () => {
  const f = await fixture(), r = await f.invite();
  await assert.rejects(f.staff.home(f.owner.id, f.owner.sessionId, { inviteCursor: r.id }), { status: 404 });
  const foreign = { ...f.state.organizationMembership[0], id: randomUUID(), organizationId: randomUUID() }; f.state.organizationMembership.push(foreign);
  await assert.rejects(f.staff.staff(f.owner.id, f.owner.sessionId, f.id, { memberCursor: foreign.id }), { status: 404 });
  await assert.rejects(f.staff.change(f.owner.id, f.owner.sessionId, f.id, foreign.id, { expectedStaffVersion: 2, expectedVersion: 1, permissions: [], enabled: false }), { status: 404 });
});

test("staff HTTP mutations require session and trusted Origin and keep organization responses private", async () => {
  const f = await fixture(), app = express(); app.use(express.json());
  app.use("/api/v1", createOrganizationStaffRoutes({ staff: f.staff, sessions: { async authenticate(token) { const actor = f.actors[token]; if (!actor) throw Object.assign(Error("Sign in"), { status: 401 }); return { account: { id: actor.id }, sessionId: actor.sessionId }; } }, clientUrl: "https://brightway.test", nodeEnv: "test", limiter: (r, s, n) => n() }));
  app.use((e, req, res, next) => { void next; res.status(e.status || 500).json({ success: false, message: e.message }); });
  const server = app.listen(0, "127.0.0.1"); await new Promise(r => server.once("listening", r)); const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  try {
    const path = `/organization-workspace/${f.id}/invitations`, body = { expectedStaffVersion: 1, idempotencyKey: randomUUID(), username: f.recipient.username, permissions: [POSTS] };
    const send = (token, origin) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Cookie: `brightway_session=${token}` } : {}), ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
    assert.equal((await send()).status, 401); assert.equal((await send("owner")).status, 403); assert.equal((await send("owner", "https://foreign.test")).status, 403);
    const result = await send("owner", "https://brightway.test"); assert.equal(result.status, 200); assert.equal(result.headers.get("cache-control"), "no-store");
    const data = await result.json(); assert.equal(data.data.username, f.recipient.username); assert.equal("email" in data.data, false);
    assert.equal((await fetch(base + `/organization-workspace/${f.id}/staff`, { headers: { Cookie: "brightway_session=other" } })).status, 403);
  } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
});

test("staff paging returns bounded tenant-scoped pages with private projections", async () => {
  const f = await fixture();
  for (let i = 0; i < 22; i++) { const id = randomUUID(); f.state.account.push({ id, username: `staff_${i}`, status: "ACTIVE" }); await f.db.organizationMembership.create({ data: { accountId: id, organizationId: f.id, role: "STAFF", enabled: true, permissions: [] } }); }
  const first = await f.staff.staff(f.owner.id, f.owner.sessionId, f.id); assert.equal(first.members.length, 20); assert(first.nextMemberCursor);
  const next = await f.staff.staff(f.owner.id, f.owner.sessionId, f.id, { memberCursor: first.nextMemberCursor }); assert.equal(next.members.length, 3);
  assert.equal(new Set([...first.members, ...next.members].map(m => m.id)).size, 23);
  for (const m of [...first.members, ...next.members]) { assert(m.username); assert.equal("email" in m, false); }
});
