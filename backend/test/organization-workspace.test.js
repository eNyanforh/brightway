import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { organizationFixture } from "../test-support/organization-fixture.js";
import { createOrganizationStaffService } from "../src/modules/organizations/organization-staff.service.js";
import { createCredentialService } from "../src/modules/credentials/credential.service.js";
async function fixture(input) {
  const f = organizationFixture(), approved = await f.decide(await f.report(await f.assign(await f.submit(input || f.input()))));
  const staff = createOrganizationStaffService({ prisma: f.db, now: f.now }), orgId = approved.organizationId;
  return { ...f, staff, orgId, context: () => staff.context(f.actors.owner.id, f.actors.owner.sessionId, orgId) };
}
test("approved primary administrator receives scoped ready tools and honest planned tools without Campus activation", async () => {
  const f = await fixture(), c = await f.context();
  assert.deepEqual(c.workspace.available.map(m => m.key), ["overview", "profile", "staff", "credentials"]);
  assert(c.workspace.available.filter(m => !m.external).every(m => m.to.startsWith(`/organization-workspace/${f.orgId}`)));
  assert.deepEqual(c.workspace.planned.map(m => m.key), ["posts", "opportunities", "applications", "programs", "admissions", "analytics"]);
  assert(c.workspace.planned.every(m => !m.to)); assert.equal(c.workspace.campusActive, false);
  // Browsing one's workspace never bypasses MFA for privileged tool actions.
  await assert.rejects(f.staff.staff(f.actors.owner.id, f.actors.owner.sessionId, f.orgId), { status: 403 });
});
test("ordinary staff only receive tools allowed by their current membership and lose them on revocation", async () => {
  const f = await fixture(), member = { id: randomUUID(), organizationId: f.orgId, accountId: f.actors.other.id, enabled: true, role: "STAFF", permissions: ["organization.credentials.education.review"], version: 1 };
  f.state.organizationMembership.push(member);
  const read = () => f.staff.context(f.actors.other.id, f.actors.other.sessionId, f.orgId);
  assert.deepEqual((await read()).workspace.available.map(m => m.key), ["overview", "profile", "credentials"]);
  assert.equal((await read()).workspace.planned.length, 0);
  f.state.organizationMembership.find(m => m.id === member.id).enabled = false;
  await assert.rejects(read(), { status: 403 });
});
test("non-training global company has applicable planned tools and no academic or Campus entitlement", async () => {
  const initial = organizationFixture();
  const f = await fixture({ ...initial.input(), type: "COMPANY", offersTraining: false }), c = await f.context();
  assert(!c.permissions.includes("organization.credentials.education.review"));
  assert(!c.workspace.planned.some(m => ["programs", "admissions"].includes(m.key)));
  assert(!c.workspace.available.some(m => /campus|billing/.test(m.key)));
  assert.equal(c.workspace.campusActive, false);
});
test("issuer-review queue preserves the same current organization navigation and rejects withdrawn MFA", async () => {
  const f = await fixture(), actor = f.actors.owner;
  f.state.mfaFactor.push({ accountId: actor.id, enabled: true, version: 1 }); Object.assign(f.state.session.find(s => s.id === actor.sessionId), { mfaVerifiedAt: f.now(), mfaVersion: 1 });
  f.db.credentialReview = { findMany: async () => [] };
  const credentials = createCredentialService({ prisma: f.db, storage: {}, now: f.now });
  const queue = await credentials.queue(actor.id, null, actor.sessionId, f.orgId);
  assert.equal(queue.organization.id, f.orgId); assert.equal(queue.organization.type, "SCHOOL");
  assert.deepEqual(queue.workspace, (await f.context()).workspace);
  f.state.mfaFactor.find(factor => factor.accountId === actor.id).version++;
  await assert.rejects(credentials.queue(actor.id, null, actor.sessionId, f.orgId), { status: 403 });
});
