import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import express from "express";
import { request } from "node:http";
import { randomUUID } from "node:crypto";
import { manualEvidenceFixture } from "../test-support/manual-identity-evidence-fixture.js";
import { createManualIdentityEvidenceService, MANUAL_IDENTITY_CONSENT as CONSENT } from "../src/modules/manual-identity/manual-identity-evidence.service.js";
import { createManualIdentityEvidenceRoutes } from "../src/modules/manual-identity/manual-identity-evidence.routes.js";
import { processIdentityImage } from "../src/modules/manual-identity/manual-identity.image.js";
import { createManualIdentityStorage } from "../src/modules/manual-identity/manual-identity.storage.js";
const upload = (f, kind = "GOVERNMENT_ID") => f.service.upload(f.ownerId, kind, Buffer.from("test input"), "image/png", CONSENT);

test("identity evidence enforces server-owned eligibility and explicit consent before any storage write", async () => {
  const f = manualEvidenceFixture();
  for (const [field, replacement] of [["headline", null], ["educationRecords", [{ status: "DRAFT" }]], ["experienceRecords", [{ status: "SUBMITTED" }]], ["educationMode", "NONE"]]) {
    const before = f.state.profile[0][field]; f.state.profile[0][field] = replacement;
    await assert.rejects(upload(f), { status: 403 }); f.state.profile[0][field] = before;
  }
  await assert.rejects(f.service.upload(f.ownerId, "SELFIE", Buffer.from("x"), "image/png", ""), { status: 400 });
  await assert.rejects(f.service.upload(f.ownerId, "SELFIE", Buffer.from("x"), "application/pdf", CONSENT), { status: 400 });
  await assert.rejects(f.service.upload(undefined, "SELFIE", Buffer.from("x"), "image/png", CONSENT), { status: 401 });
  assert.equal(f.objects.size, 0); assert.equal(f.state.manualIdentityEvidence.length, 0);
});

test("private identity evidence has an isolated owner scope, expires and never exposes storage keys or trust", async () => {
  const f = manualEvidenceFixture(), id = (await upload(f)).id;
  await upload(f, "SELFIE");
  assert.equal((await f.service.list(f.ownerId)).length, 2);
  assert.equal((await f.service.list(f.otherId)).length, 0);
  const json = JSON.stringify(await f.service.list(f.ownerId));
  for (const word of ["storageKey", "consentedAt", "identityVerified", "http"]) assert(!json.includes(word));
  await assert.rejects(f.service.read(f.otherId, id), { status: 404 });
  await assert.rejects(f.service.remove(f.otherId, id), { status: 404 });
  assert.equal((await f.service.read(f.ownerId, id)).bytes.toString(), "sanitized webp");
  f.advance(24 * 3600000);
  await assert.rejects(f.service.read(f.ownerId, id), { status: 404 });
  assert.equal((await f.service.list(f.ownerId)).length, 0);
});

test("failed storage and decoding retain durable cleanup records; quota persists across service recreation", async () => {
  const f = manualEvidenceFixture();
  f.storage.put = async (key) => { f.objects.set(key, Buffer.from("partial")); throw Error("network failed"); };
  await assert.rejects(upload(f));
  assert.equal(f.state.manualIdentityEvidence[0].state, "DELETE_PENDING");
  const another = createManualIdentityEvidenceService({ prisma: f.db, storage: f.storage, now: f.now, processImage: async () => { throw Object.assign(Error("bad image"), { status: 415 }); } });
  await assert.rejects(another.upload(f.ownerId, "SELFIE", Buffer.from("x"), "image/png", CONSENT), { status: 415 });
  assert.equal(f.state.manualIdentityUploadBudget[0].count, 2);
  f.state.manualIdentityUploadBudget[0].count = 20;
  await assert.rejects(upload(f), { status: 429 });
  f.advance(11 * 60000);
  assert.deepEqual(await f.service.cleanup(), { deleted: 2, failed: 0 });
  assert.equal(f.objects.size, 0);
});

test("cleanup retries storage deletion and protects attached evidence; removal denies reads immediately", async () => {
  const f = manualEvidenceFixture(), one = await upload(f), two = await upload(f, "SELFIE");
  await f.service.remove(f.ownerId, one.id);
  await assert.rejects(f.service.read(f.ownerId, one.id), { status: 404 });
  f.state.manualIdentityEvidence.find((r) => r.id === two.id).state = "ATTACHED";
  f.advance(26 * 3600000);
  const original = f.storage.delete;
  f.storage.delete = async () => { throw Error("offline"); };
  assert.deepEqual(await f.service.cleanup(), { deleted: 0, failed: 1 });
  assert.equal(f.objects.size, 2);
  f.storage.delete = original; f.advance(11 * 60000);
  assert.deepEqual(await f.service.cleanup(), { deleted: 1, failed: 0 });
  assert.equal(f.objects.size, 1);
  assert.equal(f.state.manualIdentityEvidence.find((r) => r.id === two.id).state, "ATTACHED");
});

test("suspension during storage cannot produce ready evidence, and removal during download prevents disclosure", async () => {
  const f = manualEvidenceFixture();
  const put = f.storage.put;
  f.storage.put = async (...args) => { await put(...args); f.state.account[0].status = "SUSPENDED"; };
  await assert.rejects(upload(f), { status: 401 });
  assert.equal(f.state.manualIdentityEvidence[0].state, "DELETE_PENDING");
  f.state.account[0].status = "ACTIVE"; f.storage.put = put;
  const saved = await upload(f);
  f.storage.get = async () => { await f.service.remove(f.ownerId, saved.id); return Buffer.from("private"); };
  await assert.rejects(f.service.read(f.ownerId, saved.id), { status: 404 });
});

test("actual image decoding rejects forged formats and strips metadata while retaining readable resolution", async () => {
  const bytes = await sharp({ create: { width: 1800, height: 1200, channels: 3, background: "white" } }).jpeg().withMetadata().toBuffer();
  const result = await processIdentityImage(bytes, "image/jpeg"), metadata = await sharp(result.bytes).metadata();
  assert.equal(metadata.format, "webp"); assert.equal(metadata.width, 1800); assert.equal(metadata.height, 1200);
  assert.equal(metadata.exif, undefined); assert.equal(metadata.icc, undefined);
  await assert.rejects(processIdentityImage(bytes, "image/png"), { status: 415 });
  await assert.rejects(processIdentityImage(Buffer.from("not an image"), "image/jpeg"), { status: 415 });
  await assert.rejects(processIdentityImage(Buffer.alloc(5 * 1024 * 1024 + 1), "image/jpeg"), { status: 413 });
});

test("identity storage fails closed without a distinct bucket and sends private server-side commands only", async () => {
  assert.throws(() => createManualIdentityStorage({ config: { R2_BUCKET: "photos" } }).check(), { status: 503 });
  assert.throws(() => createManualIdentityStorage({ config: { R2_BUCKET: "photos", R2_IDENTITY_BUCKET: "photos" } }).check(), { status: 503 });
  const calls = [], s = createManualIdentityStorage({ config: { R2_BUCKET: "photos", R2_IDENTITY_BUCKET: "private-id" }, client: { async send(command) { calls.push(command); return {}; } } });
  await s.put("manual-identity/random.webp", Buffer.from("image"), "image/webp");
  assert.equal(calls[0].input.Bucket, "private-id"); assert.equal(calls[0].input.ACL, undefined);
});

test("identity evidence HTTP requires session, trusted Origin and explicit notice; supplied ownership cannot override session", async () => {
  const f = manualEvidenceFixture(), app = express();
  app.use(express.json());
  app.use("/api/v1", createManualIdentityEvidenceRoutes({ evidence: f.service, sessions: { async authenticate(token) {
    if (token !== "owner") throw Object.assign(Error("Please log in"), { status: 401 });
    return { account: { id: f.ownerId } };
  } }, clientUrl: "http://localhost:5173", nodeEnv: "test", limiter: (req, res, next) => next() }));
  app.use((error, req, res, next) => { void next; res.status(error.status ?? 500).json({ success: false }); });
  const server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/manual-identity/evidence`;
  const headers = { Cookie: "brightway_session=owner", Origin: "http://localhost:5173", "Content-Type": "image/png", "X-Identity-Consent": CONSENT };
  try {
    assert.equal((await fetch(base)).status, 401);
    assert.equal((await fetch(`${base}/SELFIE`, { method: "POST", headers: { ...headers, Origin: "https://foreign.invalid" }, body: "x" })).status, 403);
    assert.equal((await fetch(`${base}/SELFIE?accountId=${f.otherId}`, { method: "POST", headers, body: "x" })).status, 400);
    assert.equal((await fetch(`${base}/SELFIE`, { method: "POST", headers: { ...headers, "X-Identity-Consent": "" }, body: "x" })).status, 400);
    const posted = await fetch(`${base}/SELFIE`, { method: "POST", headers, body: "x" });
    assert.equal(posted.status, 201); assert.equal(posted.headers.get("cache-control"), "no-store");
    const id = (await posted.json()).data.id;
    const downloaded = await fetch(`${base}/${id}/download`, { headers });
    assert.equal(downloaded.status, 200); assert.equal(downloaded.headers.get("content-type"), "application/octet-stream");
    assert(downloaded.headers.get("content-disposition").startsWith("attachment;"));
    assert.equal(f.state.manualIdentityEvidence[0].accountId, f.ownerId);
    assert.equal((await fetch(`${base}/${randomUUID()}`, { method: "DELETE", headers })).status, 404);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("disconnecting an identity upload keeps its HTTP slot occupied until processing finishes", async () => {
  const f = manualEvidenceFixture();
  let release, signalStarted;
  const blocked = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { signalStarted = resolve; });
  const service = createManualIdentityEvidenceService({ prisma: f.db, storage: f.storage, now: f.now,
    processImage: async () => { signalStarted(); await blocked; return f.image(); } });
  const app = express();
  app.use(createManualIdentityEvidenceRoutes({ evidence: service,
    sessions: { async authenticate() { return { account: { id: f.ownerId } }; } },
    clientUrl: "http://localhost:5173", nodeEnv: "test", limiter: (req, res, next) => next() }));
  app.use((error, req, res, next) => { void next; res.status(error.status ?? 500).end(); });
  const server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}/manual-identity/evidence/SELFIE`;
  const headers = { Origin: "http://localhost:5173", "Content-Type": "image/png", "X-Identity-Consent": CONSENT };
  const first = request(url, { method: "POST", headers }, (res) => res.resume());
  first.on("error", () => {});
  first.end("input");
  let second;
  try {
    await started;
    const closed = new Promise((resolve) => first.once("close", resolve));
    first.destroy(); await closed;
    // The disconnected request still occupies one of the two route slots.
    let secondStarted;
    const reached = new Promise((resolve) => { secondStarted = resolve; });
    const originalFind = f.db.manualIdentityEvidence.create;
    f.db.manualIdentityEvidence.create = async (args) => { const row = await originalFind(args); secondStarted(); return row; };
    second = fetch(url, { method: "POST", headers, body: "second" });
    await reached;
    const third = await fetch(url, { method: "POST", headers, body: "third" });
    assert.equal(third.status, 503);
    release();
    assert.equal((await second).status, 201);
  } finally {
    release(); first.destroy();
    if (second) await second;
    await new Promise((resolve) => server.close(resolve));
  }
});
