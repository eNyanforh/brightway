import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { organizationFixture } from "../test-support/organization-fixture.js";
import { createOrganizationProfileService } from "../src/modules/organizations/organization-profile.service.js";
import { createOrganizationProfileRoutes } from "../src/modules/organizations/organization-profile.routes.js";
import { createOrganizationStaffService } from "../src/modules/organizations/organization-staff.service.js";
import { credentialReviewerScope } from "../src/modules/credentials/credential-issuer.js";
async function fixture() {
  const f = organizationFixture({ ready: false }), approved = await f.decide(await f.report(await f.assign(await f.submit()))), id = approved.organizationId;
  const actor = f.actors.owner, objects = new Map();
  f.state.mfaFactor.push({ accountId: actor.id, enabled: true, version: 1 });
  Object.assign(f.state.session.find(s => s.id === actor.sessionId), { mfaVerifiedAt: f.now(), mfaVersion: 1 });
  const storage = { check() {}, async put(key, bytes) { objects.set(key, bytes); }, async get(key) { return objects.get(key); }, async delete(key) { objects.delete(key); } };
  const make = (options = {}) => createOrganizationProfileService({ prisma: f.db, storage, now: f.now, process: async bytes => ({ bytes, width: 128, height: 128 }), ...options });
  const profiles = make();
  return { ...f, id, actor, objects, storage, make, profiles, org: () => f.state.organization.find(o => o.id === id),
    read: () => profiles.read(actor.id, actor.sessionId, id),
    save: (username = "brightway_school", expectedVersion = 0) => profiles.saveUsername(actor.id, actor.sessionId, id, { username, expectedVersion }),
    upload: (version = 1) => profiles.uploadPhoto(actor.id, actor.sessionId, id, version, Buffer.from("fixture"), "image/png"),
  };
}
test("approved organizations must save username and an actual picture before workspace tools or issuer review open", async () => {
  const f = await fixture(), staff = createOrganizationStaffService({ prisma: f.db, now: f.now });
  assert.equal((await f.read()).required, true); assert.equal((await f.read()).canEdit, true);
  const context = await staff.context(f.actor.id, f.actor.sessionId, f.id);
  assert.equal(context.setupRequired, true); assert.deepEqual(context.workspace.available, []);
  await assert.rejects(staff.staff(f.actor.id, f.actor.sessionId, f.id), { status: 409 });
  await assert.rejects(credentialReviewerScope(f.db, f.actor.id, f.id), { status: 409 });
  await assert.rejects(f.upload(0), { status: 400 });
  const first = await f.save("  My_School  "); assert.equal(first.username, "my_school"); assert.equal(first.required, true); assert.equal(first.version, 1);
  assert.equal((await f.read()).username, "my_school");
  const done = await f.upload(); assert.equal(done.required, false); assert.equal(done.version, 2); assert.equal(f.objects.size, 1);
  assert.equal((await staff.context(f.actor.id, f.actor.sessionId, f.id)).setupRequired, false);
  assert.equal((await credentialReviewerScope(f.db, f.actor.id, f.id)).organization.id, f.id);
  assert.deepEqual(await f.profiles.readPhoto(f.id, done.photo.id), Buffer.from("fixture"));
  const publicOrg = await f.service.publicOrganization(f.id); assert.equal(publicOrg.username, "my_school"); assert.equal(publicOrg.photo.id, done.photo.id);
  for (const key of ["storageKey", "profileReadyAt", "profileVersion", "profilePhotoId"]) assert.equal(key in publicOrg, false);
  assert.equal(f.state.account[0].platformRole, "MEMBER");
});
test("profile writes reject injected trust/ownership, reserved or malformed usernames and stale updates", async () => {
  const f = await fixture();
  for (const username of ["admin", "a", "with spaces", "../../path", "9school"]) await assert.rejects(f.save(username), { status: 400 });
  for (const extra of [{ verified: true }, { organizationId: randomUUID() }, { profileReadyAt: new Date() }, { photoId: randomUUID() }, { storageKey: "foreign" }]) await assert.rejects(f.profiles.saveUsername(f.actor.id, f.actor.sessionId, f.id, { username: "valid_school", expectedVersion: 0, ...extra }), { status: 400 });
  await f.save(); await assert.rejects(f.save("other_school"), { status: 409 });
  const raced = await Promise.allSettled([f.save("alpha_school", 1), f.save("beta_school", 1)]);
  assert.equal(raced.filter(r => r.status === "fulfilled").length, 1); assert.equal(raced.find(r => r.status === "rejected").reason.status, 409);
  assert.equal(f.org().profileVersion, 2); assert.equal(f.org().profileReadyAt, null);
});
test("only a current authorized member with verified email and MFA can edit the organization profile", async () => {
  const f = await fixture(), other = f.actors.other;
  await assert.rejects(f.profiles.read(other.id, other.sessionId, f.id), { status: 403 });
  f.state.organizationMembership.push({ id: randomUUID(), organizationId: f.id, accountId: other.id, enabled: true, role: "STAFF", permissions: [] });
  assert.equal((await f.profiles.read(other.id, other.sessionId, f.id)).canEdit, false);
  await assert.rejects(f.profiles.saveUsername(other.id, other.sessionId, f.id, { username: "foreign_staff", expectedVersion: 0 }), { status: 403 });
  f.state.session.find(s => s.id === f.actor.sessionId).mfaVersion = 0;
  await assert.rejects(f.save(), { status: 403 });
  assert.equal(f.org().username, null);
  f.state.organizationMembership.find(m => m.accountId === other.id).permissions = ["organization.profile.manage"];
  assert.equal((await f.profiles.read(other.id, other.sessionId, f.id)).canEdit, true);
  f.state.mfaFactor.push({ accountId: other.id, enabled: true, version: 1 });
  Object.assign(f.state.session.find(s => s.id === other.sessionId), { mfaVerifiedAt: f.now(), mfaVersion: 1 });
  assert.equal((await f.profiles.saveUsername(other.id, other.sessionId, f.id, { username: "delegated_school", expectedVersion: 0 })).username, "delegated_school");
});
test("failed image storage, stale completion, revoked access and failed audit cannot unlock or replace a profile", async () => {
  for (const mode of ["storage", "stale", "revocation", "audit"]) {
    const f = await fixture(); await f.save();
    f.storage.put = async (key, bytes) => {
      f.objects.set(key, bytes);
      if (mode === "storage") throw Object.assign(Error("Storage unavailable"), { status: 503 });
      if (mode === "stale") await f.save("changed_school", 1);
      if (mode === "revocation") f.state.organizationMembership.find(m => m.organizationId === f.id).enabled = false;
      if (mode === "audit") f.failAudit();
    };
    await assert.rejects(f.upload());
    assert.equal(f.org().profileReadyAt, null); assert.equal(f.org().profilePhotoId, null);
    assert.equal(f.state.organizationPhoto[0].state, "DELETE_PENDING");
    assert.deepEqual(await f.profiles.cleanup(), { deleted: 1, failed: 0 }); assert.equal(f.objects.size, 0);
  }
});
test("photo replacement invalidates old reads and cleanup preserves the current reference and retries failures", async () => {
  const f = await fixture(); await f.save(); const first = await f.upload();
  const second = await f.upload(2); assert.notEqual(first.photo.id, second.photo.id);
  await assert.rejects(f.profiles.readPhoto(f.id, first.photo.id), { status: 404 });
  await assert.rejects(f.profiles.readPhoto(randomUUID(), second.photo.id), { status: 404 });
  f.storage.delete = async () => { throw Error("retry storage"); };
  assert.equal((await f.profiles.cleanup()).failed, 1);
  f.storage.delete = async key => { f.objects.delete(key); };
  assert.equal((await f.profiles.cleanup()).deleted, 1); assert.equal(f.objects.size, 1);
  f.state.organizationPhoto.find(p => p.id === second.photo.id).state = "DELETE_PENDING";
  assert.equal((await f.profiles.cleanup()).deleted, 0); assert.equal(f.objects.size, 1);
});
test("organization uploads really decode images, convert to WebP and strip metadata; forged data cannot complete setup", async () => {
  const f = await fixture(); await f.save();
  const actual = f.make({ process: undefined });
  await assert.rejects(actual.uploadPhoto(f.actor.id, f.actor.sessionId, f.id, 1, Buffer.from("not an image"), "image/png"), { status: 415 });
  const bytes = await sharp({ create: { width: 160, height: 160, channels: 3, background: "#143980" } }).withMetadata({ exif: { IFD0: { Artist: "Synthetic private metadata" } } }).jpeg().toBuffer();
  const result = await actual.uploadPhoto(f.actor.id, f.actor.sessionId, f.id, 1, bytes, "image/jpeg");
  const metadata = await sharp(await actual.readPhoto(f.id, result.photo.id)).metadata();
  assert.equal(metadata.format, "webp"); assert.equal(metadata.exif, undefined); assert.equal(result.required, false);
});
test("organization photo budget persists and cannot be bypassed by fresh requests", async () => {
  const f = await fixture(); await f.save();
  for (let i = 0; i < 20; i++) f.state.organizationPhoto.push({ id: randomUUID(), organizationId: f.id, createdAt: f.now(), state: "DELETED" });
  await assert.rejects(f.upload(), { status: 429 }); assert.equal(f.org().profilePhotoId, null);
});
test("profile HTTP requires session and trusted Origin, enforces raw image limits and keeps storage keys private", async () => {
  const f = await fixture(), app = express(); app.use(express.json());
  const sessions = { async authenticate(token) { if (token !== "fixture") throw Object.assign(Error("Please log in"), { status: 401 }); return { account: { id: f.actor.id }, sessionId: f.actor.sessionId }; } };
  app.use(createOrganizationProfileRoutes({ profiles: f.profiles, sessions, clientUrl: "http://localhost:5173", nodeEnv: "test", limiter: (_req, _res, next) => next() }));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ success: false, message: error.message }));
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve)); const root = `http://127.0.0.1:${server.address().port}`, path = `/organization-workspace/${f.id}/profile`;
  const headers = { Cookie: "brightway_session=fixture", Origin: "http://localhost:5173", "Content-Type": "application/json" };
  try {
    assert.equal((await fetch(root + path)).status, 401);
    assert.equal((await fetch(root + path, { method: "PUT", headers: { ...headers, Origin: "https://foreign.invalid" }, body: JSON.stringify({ username: "school_test", expectedVersion: 0 }) })).status, 403);
    const saved = await fetch(root + path, { method: "PUT", headers, body: JSON.stringify({ username: "school_test", expectedVersion: 0 }) }); assert.equal(saved.status, 200); assert.equal(saved.headers.get("cache-control"), "no-store");
    const photoHeaders = { ...headers, "Content-Type": "image/png", "X-Organization-Profile-Version": "1" };
    assert.equal((await fetch(root + path + "/photo", { method: "POST", headers: { ...photoHeaders, "X-Organization-Profile-Version": "-1" }, body: Buffer.from("data") })).status, 400);
    assert.equal((await fetch(root + path + "/photo", { method: "POST", headers: photoHeaders, body: Buffer.alloc(5 * 1024 * 1024 + 1) })).status, 413);
    const uploaded = await fetch(root + path + "/photo", { method: "POST", headers: photoHeaders, body: Buffer.from("fixture") }); assert.equal(uploaded.status, 201);
    const payload = await uploaded.json(); assert.equal(JSON.stringify(payload).includes("storageKey"), false);
    const image = await fetch(root + payload.data.photo.url.replace("/api/v1", "")); assert.equal(image.status, 200); assert.equal(image.headers.get("content-type"), "image/webp");
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
