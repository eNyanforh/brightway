import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { organizationFixture } from "../test-support/organization-fixture.js";
import { createOrganizationRoutes } from "../src/modules/organizations/organization.routes.js";
const edit = (f, r, extra = {}) => { const { idempotencyKey, ...fields } = f.input(); void idempotencyKey; return { ...fields, expectedVersion: r.version, name: "Updated school", ...extra }; };
test("Work is persisted per owner, survives abort, and also recognizes staff memberships", async () => {
  const f = organizationFixture(), a = f.actors.owner, other = f.actors.other;
  assert.deepEqual(await f.service.workAccess(a.id, a.sessionId), { hasWork: false });
  const r = await f.submit(); assert.deepEqual(await f.service.workAccess(a.id, a.sessionId), { hasWork: true });
  assert.deepEqual(await f.service.workAccess(other.id, other.sessionId), { hasWork: false });
  await f.service.abort(a.id, a.sessionId, r.id, { expectedVersion: r.version });
  assert.deepEqual(await f.service.workAccess(a.id, a.sessionId), { hasWork: true });
  f.state.organizationMembership.push({ accountId: other.id, enabled: true }); assert.equal((await f.service.workAccess(other.id, other.sessionId)).hasWork, true);
});
test("editing recommended input archives its exact finding and input, restarts review and preserves original target/idempotency", async () => {
  const f = organizationFixture(), a = f.actors.owner, original = f.input(), submitted = await f.submit(original), r = await f.report(await f.assign(submitted));
  const finding = structuredClone(f.state.organizationFinding[0]), target = +submitted.targetAt;
  f.advance(3600000);
  const next = await f.service.edit(a.id, a.sessionId, r.id, edit(f, r));
  assert.equal(next.status, "SUBMITTED"); assert.equal(next.version, r.version + 1); assert.equal(next.name, "Updated school"); assert.equal(+next.targetAt, target);
  assert.equal(f.state.organizationRequest[0].assignedAgentId, null); assert.equal(f.state.organizationFinding.length, 0);
  for (const key of Object.keys(finding)) assert.deepEqual(f.state.organizationFindingArchive[0][key], finding[key]);
  assert.equal(f.state.organizationRequestRevision[0].snapshot.name, submitted.name); assert.equal(f.state.organizationRequestRevision[0].sourceVersion, r.version);
  assert.equal((await f.submit(original)).name, "Updated school"); // original create retry never reapplies old input
  await assert.rejects(f.decide(r), { status: 409 });
  assert.equal(f.state.organization.length, 0); assert.equal("snapshot" in next, false); assert.equal("findingHistory" in next, false);
});
test("owner edits reject foreign, injected, duplicate, stale or final records", async () => {
  const f = organizationFixture(), a = f.actors.owner, other = f.actors.other, r = await f.submit();
  await assert.rejects(f.service.edit(other.id, other.sessionId, r.id, edit(f, r)), { status: 404 });
  for (const key of ["status", "applicantId", "identityVerified", "targetAt", "assignedAgentId", "idempotencyKey"]) await assert.rejects(f.service.edit(a.id, a.sessionId, r.id, { ...edit(f, r), [key]: true }), { status: 400 });
  const second = await f.submit({ ...f.input(), name: "Second school" });
  await assert.rejects(f.service.edit(a.id, a.sessionId, second.id, edit(f, second, { name: r.name })), { status: 409 });
  const results = await Promise.allSettled([f.service.edit(a.id, a.sessionId, r.id, edit(f, r)), f.service.edit(a.id, a.sessionId, r.id, edit(f, r))]);
  assert.equal(results.filter(x => x.status === "fulfilled").length, 1); assert.equal(f.state.organizationRequestRevision.length, 1);
  const approved = await f.decide(await f.report(await f.assign(second)));
  await assert.rejects(f.service.edit(a.id, a.sessionId, approved.id, edit(f, approved)), { status: 409 });
  await assert.rejects(f.service.abort(a.id, a.sessionId, approved.id, { expectedVersion: approved.version }), { status: 409 });
});
test("abort is versioned owner-only withdrawal; stale decisions cannot create an organization and a new interest can reuse the fingerprint", async () => {
  const f = organizationFixture(), a = f.actors.owner, other = f.actors.other, r = await f.report(await f.assign(await f.submit()));
  await assert.rejects(f.service.abort(other.id, other.sessionId, r.id, { expectedVersion: r.version }), { status: 404 });
  await assert.rejects(f.service.abort(a.id, a.sessionId, r.id, { expectedVersion: r.version, status: "APPROVED" }), { status: 400 });
  const next = await f.service.abort(a.id, a.sessionId, r.id, { expectedVersion: r.version }); assert.equal(next.status, "ABORTED");
  await assert.rejects(f.decide(r), { status: 409 }); await assert.rejects(f.service.abort(a.id, a.sessionId, r.id, { expectedVersion: r.version }), { status: 409 });
  assert.equal(f.state.organization.length, 0); assert.equal(f.state.organizationFinding.length, 1);
  assert.equal((await f.service.queue(f.actors.approver.id, f.actors.approver.sessionId)).requests.length, 0);
  assert.equal((await f.submit()).status, "SUBMITTED");
});
test("failed audit or revoked session rolls input changes, finding retirement and abort back together", async () => {
  for (const method of ["edit", "abort"]) {
    const f = organizationFixture(), a = f.actors.owner, r = await f.report(await f.assign(await f.submit()));
    const before = structuredClone(f.state.organizationRequest[0]); f.failAudit();
    await assert.rejects(f.service[method](a.id, a.sessionId, r.id, method === "edit" ? edit(f, r) : { expectedVersion: r.version }), /Audit failed/);
    assert.deepEqual(f.state.organizationRequest[0], before); assert.equal(f.state.organizationRequestRevision.length, 0); assert.equal(f.state.organizationFindingArchive.length, 0); assert.equal(f.state.organizationFinding.length, 1);
    f.failAudit(false); f.onAudit(data => { if (data.action.startsWith("APPLICANT_")) f.state.session = f.state.session.filter(s => s.id !== a.sessionId); });
    await assert.rejects(f.service[method](a.id, a.sessionId, r.id, method === "edit" ? edit(f, r) : { expectedVersion: r.version }), { status: 401 });
    assert.deepEqual(f.state.organizationRequest[0], before);
  }
});
test("approved owner cards only offer workspace access while the current membership and organization are active", async () => {
  const f = organizationFixture(), r = await f.decide(await f.report(await f.assign(await f.submit()))), a = f.actors.owner;
  assert.equal((await f.service.owner(a.id, a.sessionId, r.id)).workspaceAvailable, true);
  f.state.organizationMembership[0].enabled = false; assert.equal((await f.service.owner(a.id, a.sessionId, r.id)).workspaceAvailable, false);
});
test("HTTP edit/abort/access require session, trusted mutation Origin and strict owner-bound payloads", async () => {
  const f = organizationFixture(), r = await f.submit(), app = express(); app.use(express.json());
  app.use(createOrganizationRoutes({ organizations: f.service, clientUrl: "https://brightway.test", nodeEnv: "test", limiter: (req, res, next) => next(), sessions: { async authenticate(token) { const a = f.actors[token]; if (!a) throw Object.assign(Error("Sign in"), { status: 401 }); return { account: { id: a.id }, sessionId: a.sessionId }; } } }));
  app.use((e, req, res, next) => { void next; res.status(e.status || 500).json({ success: false }); });
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  const send = (path, method = "GET", body, token = "owner", origin) => fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Cookie: `brightway_session=${token}` } : {}), ...(origin ? { Origin: origin } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    assert.equal((await send("/work/access", "GET", null, null)).status, 401);
    const access = await send("/work/access"); assert.equal(access.headers.get("cache-control"), "no-store"); assert.equal((await access.json()).data.hasWork, true);
    assert.equal((await send(`/organization-requests/${r.id}`, "PATCH", edit(f, r))).status, 403);
    assert.equal((await send(`/organization-requests/${r.id}/abort`, "POST", { expectedVersion: r.version }, "owner", "https://foreign.test")).status, 403);
    assert.equal((await send(`/organization-requests/${r.id}`, "PATCH", edit(f, r), "other", "https://brightway.test")).status, 404);
    assert.equal((await send(`/organization-requests/${r.id}/abort`, "POST", { expectedVersion: r.version }, "owner", "https://brightway.test")).status, 200);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
