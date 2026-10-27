import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { organizationFixture } from "../test-support/organization-fixture.js";
import { createOrganizationRoutes } from "../src/modules/organizations/organization.routes.js";
import { createOrganizationService } from "../src/modules/organizations/organization.service.js";

test("organization requests accept global locations, strict fields and the non-school training question", async () => {
  const f = organizationFixture();
  for (const field of ["applicantId", "status", "identityVerified", "agentEnabled", "campusActive", "membership", "evidence"]) await assert.rejects(f.submit({ ...f.input(), [field]: true }), { status: 400 });
  for (const countryCode of ["ZZ", "", "USA"]) await assert.rejects(f.submit({ ...f.input(), countryCode }), { status: 400 });
  await assert.rejects(f.submit({ ...f.input(), type: "NGO" }), { status: 400 });
  await assert.rejects(f.submit({ ...f.input(), offersTraining: false }), { status: 400 });
  const r = await f.submit(); assert.equal(r.location.countryCode, "GH"); assert.equal(r.name, "Global Test School"); assert.equal(r.offersTraining, true);
  assert.equal(+r.targetAt - +f.now(), 72 * 3600000);
  for (const offersTraining of [true, false]) assert.equal((await f.submit({ ...f.input(), name: `NGO ${offersTraining}`, type: "NGO", offersTraining })).offersTraining, offersTraining);
});
test("owner/session binding, idempotent retries and persistent attempt limits precede public presence", async () => {
  const f = organizationFixture(), data = f.input(), o = f.actors.owner;
  await assert.rejects(f.service.submit(o.id, undefined, data), { status: 401 });
  const results = await Promise.all([f.submit(data), f.submit(data)]); assert.equal(results[0].id, results[1].id); assert.equal(f.state.organizationRequest.length, 1); assert.equal(f.state.organizationRequestAudit.length, 1);
  await assert.rejects(f.submit({ ...data, name: "Changed under same key" }), { status: 409 });
  await assert.rejects(f.submit(f.input()), { status: 409 });
  await assert.rejects(f.service.publicOrganization(results[0].id), { status: 404 }); assert.equal(f.state.organization.length, 0);
  for (let i = 0; i < 4; i++) await f.submit({ ...f.input(), name: `Distinct ${i}` });
  const recreated = createOrganizationService({ prisma: f.db, now: f.now });
  await assert.rejects(recreated.submit(o.id, o.sessionId, { ...f.input(), name: "Sixth" }), { status: 429 });
});
test("owners cannot read foreign requests/cursors or internal Agent notes", async () => {
  const f = organizationFixture(), r = await f.submit(), other = f.actors.other;
  await assert.rejects(f.service.owner(other.id, other.sessionId, r.id), { status: 404 });
  await assert.rejects(f.service.ownerList(other.id, other.sessionId, r.id), { status: 404 });
  await f.report(await f.assign(r)); const owner = await f.service.owner(f.actors.owner.id, f.actors.owner.sessionId, r.id);
  for (const key of ["finding", "notes", "setupAssistance", "assignedAgentId", "inputHash", "fingerprint", "applicantId"]) assert.equal(key in owner, false);
});
test("dedicated roles, assignment and current MFA protect every organization operator action", async () => {
  const f = organizationFixture(), r = await f.submit(), { owner, agent, approver, other } = f.actors;
  f.state.account.find(a => a.id === other.id).platformRole = "CREDENTIAL_REVIEWER";
  await assert.rejects(f.service.queue(other.id, other.sessionId), { status: 403 });
  await assert.rejects(f.service.detail(agent.id, agent.sessionId, r.id), { status: 403 });
  await assert.rejects(f.service.assign(agent.id, agent.sessionId, r.id, { expectedVersion: 1, agentUsername: agent.username }), { status: 403 });
  await assert.rejects(f.service.assign(approver.id, approver.sessionId, r.id, { expectedVersion: 1, agentUsername: owner.username }), { status: 403 });
  f.state.session.find(s => s.id === approver.sessionId).mfaVersion = 0;
  await assert.rejects(f.assign(r), { status: 403 });
  f.state.session.find(s => s.id === approver.sessionId).mfaVersion = 1;
  const assigned = await f.assign(r); assert.equal((await f.service.queue(agent.id, agent.sessionId)).requests.length, 1);
  f.state.organizationOperator.find(x => x.accountId === agent.id).agentEnabled = false;
  await assert.rejects(f.report(assigned), { status: 403 });
});
test("separate final approver and complete positive findings are required; overdue never approves", async () => {
  const f = organizationFixture(), r = await f.assign(await f.submit());
  await assert.rejects(f.service.report(f.actors.agent.id, f.actors.agent.sessionId, r.id, { ...f.finding(), existenceConfirmed: false }), { status: 400 });
  const recommended = await f.report(r);
  f.state.organizationOperator.find(x => x.accountId === f.actors.agent.id).approverEnabled = true;
  await assert.rejects(f.service.decide(f.actors.agent.id, f.actors.agent.sessionId, r.id, { expectedVersion: recommended.version, decision: "APPROVE", reason: "Cannot approve my own investigation." }), { status: 403 });
  f.advance(73 * 3600000); const own = await f.service.owner(f.actors.owner.id, f.actors.owner.sessionId, r.id);
  assert.equal(own.overdue, true); assert.equal(own.status, "RECOMMENDED"); assert.equal(f.state.organization.length, 0);
});
test("approval atomically creates one public organization, location, primary membership and audit without other trust grants", async () => {
  const f = organizationFixture(), r = await f.report(await f.assign(await f.submit())), result = await f.decide(r);
  assert.equal(result.status, "APPROVED"); assert.equal(f.state.organization.length, 1); assert.equal(f.state.organizationOperatingLocation.length, 1); assert.equal(f.state.organizationMembership.length, 1);
  assert.equal(f.state.organizationMembership[0].role, "PRIMARY_ADMIN"); assert.equal(f.state.organizationMembership[0].accountId, f.actors.owner.id);
  const publicOrg = await f.service.publicOrganization(result.organizationId); assert.equal(publicOrg.verified, true); assert.equal(publicOrg.locations[0].countryCode, "GH");
  for (const key of ["applicantId", "requestId", "memberships", "finding", "representativeRole", "campusActive", "identityVerified"]) assert.equal(key in publicOrg, false);
  assert.equal(f.state.account[0].platformRole, "MEMBER"); assert.equal(f.state.account[0].identityRevision, 0);
  await assert.rejects(f.decide(r), { status: 409 }); assert.equal(f.state.organizationRequestAudit.filter(a => a.action === "APPROVED").length, 1);
});
test("audit failure rolls organization, location, membership and request decision back together", async () => {
  const f = organizationFixture(), r = await f.report(await f.assign(await f.submit())); f.failAudit();
  await assert.rejects(f.decide(r), /Audit failed/); assert.equal(f.state.organization.length, 0); assert.equal(f.state.organizationMembership.length, 0); assert.equal(f.state.organizationOperatingLocation.length, 0); assert.equal(f.state.organizationRequest[0].status, "RECOMMENDED");
  f.failAudit(false); assert.equal((await f.decide(r)).status, "APPROVED");
});
test("revocation and MFA changes inside the transaction prevent successful decisions", async () => {
  for (const kind of ["role", "mfa", "agent"]) {
    const f = organizationFixture(), r = await f.report(await f.assign(await f.submit()));
    f.onAudit(data => { if (data.action !== "APPROVED") return; if (kind === "mfa") f.state.mfaFactor.find(x => x.accountId === f.actors.approver.id).version++;
      else f.state.organizationOperator.find(x => x.accountId === f.actors[kind === "agent" ? "agent" : "approver"].id)[kind === "agent" ? "agentEnabled" : "approverEnabled"] = false; });
    await assert.rejects(f.decide(r), { status: 403 }); assert.equal(f.state.organization.length, 0); assert.equal(f.state.organizationRequest[0].status, "RECOMMENDED");
  }
});
test("negative recommendations cannot be approved and rejection remains private with owner feedback", async () => {
  const f = organizationFixture(), r = await f.assign(await f.submit());
  const recommended = await f.service.report(f.actors.agent.id, f.actors.agent.sessionId, r.id, { ...f.finding(), existenceConfirmed: false, recommendation: "REJECT" });
  await assert.rejects(f.decide(recommended), { status: 409 }); await f.decide(recommended, "REJECT");
  assert.equal(f.state.organization.length, 0); assert((await f.service.owner(f.actors.owner.id, f.actors.owner.sessionId, r.id)).decisionReason);
});
test("reassignment and stale findings cannot overwrite the winning request version", async () => {
  const f = organizationFixture(), r = await f.submit();
  const results = await Promise.allSettled([f.assign(r), f.assign(r)]); assert.equal(results.filter(x => x.status === "fulfilled").length, 1);
  const assigned = results.find(x => x.status === "fulfilled").value;
  const reports = await Promise.allSettled([f.report(assigned), f.report(assigned)]); assert.equal(reports.filter(x => x.status === "fulfilled").length, 1); assert.equal(f.state.organizationFinding.length, 1);
});
test("HTTP organization routes enforce session, MFA, trusted Origin and private responses", async () => {
  const f = organizationFixture(), app = express(); app.use(express.json());
  app.use("/api/v1", createOrganizationRoutes({ organizations: f.service, clientUrl: "https://brightway.test", nodeEnv: "test", limiter: (req, res, next) => next(), sessions: { async authenticate(token) { const actor = f.actors[token]; if (!actor) throw Object.assign(Error("Sign in"), { status: 401 }); return { account: { id: actor.id }, sessionId: actor.sessionId, mfaVerified: ["agent", "approver"].includes(token) }; } } }));
  app.use((e, req, res, next) => { void next; res.status(e.status ?? 500).json({ success: false, message: e.message }); });
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve)); const url = `http://127.0.0.1:${server.address().port}/api/v1`;
  try {
    const send = (path, method = "GET", body, token, origin) => fetch(url + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Cookie: `brightway_session=${token}` } : {}), ...(origin ? { Origin: origin } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal((await send("/organization-requests")).status, 401);
    assert.equal((await send("/organization-requests", "POST", f.input(), "owner")).status, 403);
    assert.equal((await send("/organization-requests", "POST", f.input(), "owner", "https://foreign.test")).status, 403);
    const ok = await send("/organization-requests", "POST", f.input(), "owner", "https://brightway.test"); assert.equal(ok.status, 200); assert.equal(ok.headers.get("cache-control"), "no-store");
    assert.equal((await send("/admin/organizations", "GET", null, "owner")).status, 403);
    assert.equal((await send(`/organizations/${randomUUID()}`)).status, 404);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});


test("public presence requires its request approval as well as active organization state", async () => {
  const f = organizationFixture(), request = await f.report(await f.assign(await f.submit())), result = await f.decide(request);
  f.state.organizationRequest[0].status = "REJECTED";
  await assert.rejects(f.service.publicOrganization(result.organizationId), { status: 404 });
});
