import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { randomUUID } from "node:crypto";
import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import sharp from "sharp";
import { credentialFixture } from "../test-support/credential-fixture.js";
import { createCredentialService, publicCredential, reviewView } from "../src/modules/credentials/credential.service.js";
import { submitSchema, decisionSchema } from "../src/modules/credentials/credential.schema.js";
import { processEvidence } from "../src/modules/credentials/evidence.process.js";
import { createCredentialRoutes } from "../src/modules/credentials/credential.routes.js";
import { saveProfileHistory } from "../src/modules/profile/profile-history.service.js";
const fixture = () => {
  const f = credentialFixture();
  return { ...f, service: createCredentialService({ prisma: f.db, storage: f.storage, now: f.now, process: async (bytes, type) => ({ bytes, contentType: type }) }) };
};
async function submit(f) {
  const asset = await f.service.upload(f.personId, "education", f.recordId, f.state.educationRecord[0].revision, Buffer.from("evidence"), "application/pdf");
  const input = { expectedVersion: f.state.profile[0].version, revision: f.state.educationRecord[0].revision, evidenceIds: [asset.id] };
  return { asset, input, result: await f.service.submit(f.personId, f.ownerId, "education", f.recordId, input) };
}
async function assign(f) {
  const review = f.state.credentialReview[0];
  await f.service.transition(f.reviewerId, review.id, { expectedVersion: review.version }, true);
}
async function decide(f, status = "VERIFIED") {
  const review = f.state.credentialReview[0];
  await f.service.transition(f.reviewerId, review.id, { expectedVersion: review.version, revision: review.revision, status, note: "Checked the supporting institution document." });
}

test("credential input is strict and requires unique supporting evidence and attributable decisions", () => {
  const id = randomUUID();
  for (const input of [{ expectedVersion: 1, revision: 1, evidenceIds: [] }, { expectedVersion: 1, revision: 1, evidenceIds: [id, id] }, { expectedVersion: 1, revision: 1, evidenceIds: [id], status: "VERIFIED" }]) assert.equal(submitSchema.safeParse(input).success, false);
  assert.equal(decisionSchema.safeParse({ expectedVersion: 1, revision: 1, status: "VERIFIED", note: "ok" }).success, false);
  assert.equal(decisionSchema.safeParse({ expectedVersion: 1, revision: 1, status: "VERIFIED", note: "Checked evidence", personId: "injected" }).success, false);
});

test("submitting snapshots a saved claim, privately binds evidence and atomically changes profile status", async () => {
  const f = fixture(), { asset, result } = await submit(f);
  assert.equal(f.state.profile[0].version, 2);
  assert.equal(f.state.educationRecord[0].status, "SUBMITTED");
  assert.equal(f.state.credentialEvidence[0].state, "ATTACHED");
  assert.equal(f.state.credentialAttempt[0].snapshot.institution, "School");
  assert.equal(f.state.credentialAuditEvent[0].actorId, f.ownerId);
  assert.equal(result.profile.completion.eligibleToRequestVerification, false);
  const owner = await f.service.owner(f.personId, "education", f.recordId);
  assert.equal(owner.review.events[0].actorId, undefined);
  assert(!JSON.stringify(owner).includes("credential-evidence/"));
  assert.equal((await f.service.readEvidence(f.ownerId, f.personId, asset.id)).bytes.toString(), "private");
  await assert.rejects(f.service.readEvidence(f.otherId, "other", asset.id), { status: 404 });
});

test("foreign, wrong-revision, expired and reused evidence roll back the entire submission", async () => {
  for (const mutation of [row => { row.personId = "foreign"; }, row => { row.revision = 99; }, row => { row.expiresAt = new Date(0); }, row => { row.state = "ATTACHED"; row.attemptId = "used"; }]) {
    const f = fixture();
    const asset = await f.service.upload(f.personId, "education", f.recordId, 1, Buffer.from("doc"), "application/pdf");
    mutation(f.state.credentialEvidence[0]);
    await assert.rejects(f.service.submit(f.personId, f.ownerId, "education", f.recordId, { expectedVersion: 1, revision: 1, evidenceIds: [asset.id] }), { status: 400 });
    assert.equal(f.state.profile[0].version, 1);
    assert.equal(f.state.educationRecord[0].status, "DRAFT");
    assert.equal(f.state.credentialReview.length, 0);
    assert.equal(f.state.credentialAttempt.length, 0);
    assert.equal(f.state.credentialAuditEvent.length, 0);
  }
});

test("stale, foreign and duplicate submissions cannot claim evidence or overwrite saved records", async () => {
  const f = fixture();
  await assert.rejects(f.service.owner("foreign", "education", f.recordId), { status: 404 });
  const asset = await f.service.upload(f.personId, "education", f.recordId, 1, Buffer.from("doc"), "application/pdf");
  await assert.rejects(f.service.submit(f.personId, f.ownerId, "education", f.recordId, { expectedVersion: 0, revision: 1, evidenceIds: [asset.id] }), { status: 409 });
  const input = { expectedVersion: 1, revision: 1, evidenceIds: [asset.id] };
  const results = await Promise.allSettled([f.service.submit(f.personId, f.ownerId, "education", f.recordId, input), f.service.submit(f.personId, f.ownerId, "education", f.recordId, input)]);
  assert.equal(results.filter((v) => v.status === "fulfilled").length, 1);
  assert.equal(f.state.credentialAttempt.length, 1);
});

test("reviewer permissions, self-review, assignment and stale decisions are enforced by the service", async () => {
  const f = fixture(); await submit(f);
  await assert.rejects(f.service.access(f.ownerId), { status: 403 });
  await assert.rejects(f.service.queue(f.otherId), { status: 403 });
  f.state.account[0].platformRole = "CREDENTIAL_REVIEWER";
  await assert.rejects(f.service.transition(f.ownerId, f.state.credentialReview[0].id, { expectedVersion: 1 }, true), { status: 403 });
  const otherAdmin = { id: randomUUID(), personId: randomUUID(), status: "ACTIVE", platformRole: "CREDENTIAL_REVIEWER", emailVerifiedAt: f.now() };
  f.state.account.push(otherAdmin);
  await assign(f);
  const review = f.state.credentialReview[0];
  const input = { expectedVersion: review.version, revision: 1, status: "VERIFIED", note: "Evidence has been checked." };
  await assert.rejects(f.service.transition(otherAdmin.id, review.id, input), { status: 409 });
  await assert.rejects(f.service.transition(f.reviewerId, review.id, { ...input, revision: 2 }), { status: 409 });
  await decide(f);
  assert.equal(f.state.educationRecord[0].status, "VERIFIED");
  assert.equal(f.state.credentialAuditEvent.length, 3);
  await assert.rejects(f.service.transition(f.reviewerId, review.id, input), { status: 409 });
});

test("role revocation and a failed audit write cannot produce a successful decision", async () => {
  const f = fixture(); await submit(f); await assign(f);
  f.state.account[1].platformRole = "MEMBER";
  await assert.rejects(decide(f), { status: 403 });
  f.state.account[1].platformRole = "CREDENTIAL_REVIEWER";
  f.db.credentialAuditEvent.create = async () => { throw new Error("audit unavailable"); };
  const version = f.state.profile[0].version;
  await assert.rejects(decide(f), /audit unavailable/);
  assert.equal(f.state.profile[0].version, version);
  assert.equal(f.state.educationRecord[0].status, "IN_REVIEW");
  assert.equal(f.state.credentialReview[0].status, "IN_REVIEW");
});

test("correction edits create a new revision, preserve old snapshots and never restart the original deadline", async () => {
  const f = fixture(); await submit(f); await assign(f); await decide(f, "ACTION_REQUIRED");
  const initial = f.state.credentialReview[0].initialSubmittedAt;
  const record = f.state.educationRecord[0];
  await saveProfileHistory({ prisma: f.db, personId: f.personId, kind: "education", input: { expectedVersion: f.state.profile[0].version, mode: "RECORDS", records: [{ id: record.id, revision: record.revision, institution: "Corrected School", qualification: record.qualification, startMonth: record.startMonth, endMonth: record.endMonth, current: record.current, description: "" }] }, select: {} });
  assert.equal(f.state.educationRecord[0].revision, 2);
  f.setNow("2026-11-02T12:00:00Z");
  await submit(f);
  assert.equal(f.state.credentialAttempt.length, 2);
  assert.equal(f.state.credentialAttempt[0].snapshot.institution, "School");
  assert.equal(f.state.credentialAttempt[1].snapshot.institution, "Corrected School");
  assert.equal(f.state.credentialReview[0].initialSubmittedAt.getTime(), initial.getTime());
  assert.equal(reviewView(f.state.credentialReview[0], f.now()).hiddenFromPublic, true);
  await assign(f); await decide(f);
  assert.equal(f.state.credentialReview[0].status, "VERIFIED");
});

test("public projection evaluates the exact fourteen-day deadline and never exposes evidence or false claims", () => {
  const initialSubmittedAt = new Date("2026-01-01T00:00:00Z");
  const record = { id: "record", revision: 1, status: "SUBMITTED", institution: "School", storageKey: "private" };
  const review = { recordId: "record", kind: "education", revision: 1, status: "SUBMITTED", initialSubmittedAt };
  assert.equal(publicCredential(record, { ...review, recordId: "foreign" }, initialSubmittedAt), null);
  assert(publicCredential(record, review, new Date("2026-01-14T23:59:59Z")));
  assert.equal(publicCredential(record, review, new Date("2026-01-15T00:00:00Z")), null);
  assert.equal(publicCredential({ ...record, status: "FALSE_CREDENTIAL" }, { ...review, status: "FALSE_CREDENTIAL" }, initialSubmittedAt), null);
  const visible = publicCredential({ ...record, status: "VERIFIED" }, { ...review, status: "VERIFIED" }, new Date("2027-01-01"));
  assert.equal(visible.storageKey, undefined);
});

test("upload limits persist and storage failure leaves retriable cleanup without deleting attached evidence", async () => {
  const f = fixture();
  f.state.credentialUploadBudget.push({ personId: f.personId, hour: new Date("2026-10-18T12:00:00Z"), count: 20 });
  await assert.rejects(f.service.upload(f.personId, "education", f.recordId, 1, Buffer.from("doc"), "application/pdf"), { status: 429 });
  f.state.credentialUploadBudget[0].count = 0;
  f.storage.put = async () => { throw new Error("storage failed"); };
  await assert.rejects(f.service.upload(f.personId, "education", f.recordId, 1, Buffer.from("doc"), "application/pdf"), /storage failed/);
  assert.equal(f.state.credentialEvidence[0].state, "DELETE_PENDING");
  f.state.credentialEvidence.push({ id: "keep", state: "ATTACHED", attemptId: "live", expiresAt: new Date(0), storageKey: "keep" });
  await f.service.cleanup();
  assert.equal(f.state.credentialEvidence[0].state, "DELETED");
  assert.equal(f.state.credentialEvidence[1].state, "ATTACHED");
});

test("actual evidence decoding rejects forged or active PDFs, invalid data and oversized files", async () => {
  const pdf = await PDFDocument.create(); pdf.addPage();
  const bytes = Buffer.from(await pdf.save());
  assert.equal((await processEvidence(bytes, "application/pdf")).contentType, "application/pdf");
  pdf.catalog.set(PDFName.of("OpenAction"), pdf.context.obj({ S: PDFName.of("JavaScript"), JS: PDFString.of("alert(1)") }));
  await assert.rejects(processEvidence(Buffer.from(await pdf.save()), "application/pdf"), { status: 415 });
  await assert.rejects(processEvidence(Buffer.from("%PDF-1.7\nmalformed\n%%EOF"), "application/pdf"), { status: 415 });
  await assert.rejects(processEvidence(Buffer.alloc(5 * 1024 * 1024 + 1), "application/pdf"), { status: 413 });
  const image = await sharp({ create: { width: 256, height: 256, channels: 3, background: "white" } }).png().toBuffer();
  assert.equal((await processEvidence(image, "image/png")).contentType, "image/webp");
  await assert.rejects(processEvidence(image, "application/pdf"), { status: 415 });
  await assert.rejects(processEvidence(bytes, "image/png"), { status: 415 });
});

test("credential HTTP rejects anonymous, untrusted and injected review mutations and keeps evidence downloads private", async () => {
  const f = fixture(), app = express(); app.use(express.json());
  const sessions = { async authenticate(token) { if (token !== "owner") throw Object.assign(new Error("Login required"), { status: 401 }); return { account: { id: f.ownerId, person: { id: f.personId } } }; } };
  app.use(createCredentialRoutes({ credentials: f.service, sessions, clientUrl: "http://localhost:5173", nodeEnv: "test", limiter: (req, res, next) => next() }));
  app.use((error, req, res, next) => { void next; res.status(error.status ?? 500).json({ success: false, message: error.message }); });
  const server = app.listen(0, "127.0.0.1"); await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`, path = `/credentials/education/${f.recordId}`;
  const headers = { Cookie: "brightway_session=owner", Origin: "http://localhost:5173", "Content-Type": "application/json" };
  try {
    assert.equal((await fetch(base + path)).status, 401);
    assert.equal((await fetch(base + "/admin/credentials", { headers })).status, 403);
    assert.equal((await fetch(base + path + "/submit", { method: "POST", headers: { ...headers, Origin: "https://foreign.example" }, body: "{}" })).status, 403);
    assert.equal((await fetch(base + path + "/submit", { method: "POST", headers, body: JSON.stringify({ expectedVersion: 1, revision: 1, evidenceIds: [randomUUID()], status: "VERIFIED" }) })).status, 400);
    const read = await fetch(base + path, { headers }); assert.equal(read.headers.get("cache-control"), "no-store");
    const { asset } = await submit(f);
    const downloaded = await fetch(base + `/credentials/evidence/${asset.id}/download`, { headers });
    assert.equal(downloaded.status, 200);
    assert.equal(downloaded.headers.get("content-type"), "application/octet-stream");
    assert.match(downloaded.headers.get("content-disposition"), /^attachment/);
    assert.match(downloaded.headers.get("content-security-policy"), /sandbox/);
  } finally { await new Promise((r) => server.close(r)); }
});


test("owners can still read false-credential feedback in their private review history without exposing another user's reviews", async () => {
  const f = fixture(); await submit(f); await assign(f); await decide(f, "FALSE_CREDENTIAL");
  const list = await f.service.ownerReviews(f.personId);
  assert.equal(list.reviews.length, 1);
  assert.equal(list.reviews[0].status, "FALSE_CREDENTIAL");
  assert.equal(list.reviews[0].events[0].actorId, undefined);
  assert.equal((await f.service.ownerReviews("foreign")).reviews.length, 0);
});

test("disconnecting an evidence upload does not release its processing capacity early", async () => {
  const { request } = await import("node:http");
  let entered = 0, release;
  const pending = new Promise((r) => { release = r; });
  const id = randomUUID(), app = express();
  const sessions = { async authenticate() { return { account: { id: "owner", person: { id: "person" } } }; } };
  const credentials = { async upload() { entered++; await pending; return { id }; } };
  app.use(createCredentialRoutes({ credentials, sessions, clientUrl: "http://localhost:5173", nodeEnv: "test", limiter: (req, res, next) => next() }));
  const server = app.listen(0, "127.0.0.1"); await new Promise((r) => server.once("listening", r));
  const url = `http://127.0.0.1:${server.address().port}/credentials/education/${id}/evidence`;
  const headers = { Origin: "http://localhost:5173", "Content-Type": "application/pdf", "X-Record-Revision": "1" };
  const first = request(url, { method: "POST", headers }); first.on("error", () => {}); first.end("pdf");
  const second = request(url, { method: "POST", headers }); second.on("error", () => {}); second.end("pdf");
  try {
    const timeout = Date.now() + 3000;
    while (entered < 2 && Date.now() < timeout) await new Promise((r) => setTimeout(r, 10));
    assert.equal(entered, 2);
    first.destroy();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal((await fetch(url, { method: "POST", headers, body: "pdf" })).status, 503);
    assert.equal(entered, 2);
  } finally { release(); first.destroy(); second.destroy(); await new Promise((r) => server.close(r)); }
});

test("review decisions recheck current MFA session state inside the credential transaction", async () => {
  const f = fixture(); await submit(f);
  const sessionId = randomUUID(), factorVersion = 2;
  f.state.mfaFactor.push({ accountId: f.reviewerId, enabled: true, version: factorVersion });
  f.state.session.push({ id: sessionId, accountId: f.reviewerId, expiresAt: new Date(+f.now() + 3600000), mfaVerifiedAt: f.now(), mfaVersion: factorVersion });
  let review = f.state.credentialReview[0];
  await f.service.transition(f.reviewerId, review.id, { expectedVersion: review.version }, true, sessionId);
  f.state.session.length = 0; review = f.state.credentialReview[0];
  await assert.rejects(f.service.transition(f.reviewerId, review.id, { expectedVersion: review.version, revision: review.revision, status: "VERIFIED", note: "Institution confirmed the certificate." }, false, sessionId), { status: 403 });
  assert.equal(f.state.educationRecord[0].status, "IN_REVIEW");
  assert.equal(f.state.credentialAuditEvent.some((row) => row.action === "DECIDED"), false);
});
