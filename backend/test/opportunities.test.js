import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { createOpportunityRoutes } from "../src/modules/opportunities/opportunity.routes.js";
import { createInput, applicationInput, saveInput, challengeAssetUploadInput, validateAnswers } from "../src/modules/opportunities/opportunity.schema.js";
import { createApplicationStorage } from "../src/modules/opportunities/opportunity.storage.js";
import { processEvidence } from "../src/modules/credentials/evidence.process.js";
import { PDFDocument } from "pdf-lib";

const question = (type, extra = {}) => ({ id: randomUUID(), label: "Tell us more", type, required: true, options: [], ...extra });
const listing = () => ({ type: "JOB", title: "Data assistant", description: "Help a research team improve the quality of its data.", location: "Monrovia", workMode: "IN_PERSON", deadline: "2030-12-01T12:00:00Z", questions: [], requestKey: randomUUID() });
test("opportunity input rejects external application methods, unknown fields and invalid questions", () => {
  assert.equal(createInput.safeParse(listing()).success, true);
  const challenge = createInput.safeParse({ ...listing(), type: "CHALLENGE", prize: "US$1,000" });
  assert.equal(challenge.success, true);
  assert.equal(challenge.data.prize, "US$1,000");
  assert.deepEqual(challenge.data.topics, []);
  assert.equal(challenge.data.coverImage, "STUDENTS");
  assert.deepEqual(challenge.data.prizes, []);
  assert.deepEqual(challenge.data.sponsorLogoIds, []);
  assert.equal(challenge.data.backgroundAssetId, null);
  assert.equal(challenge.data.titleAssetId, null);
  assert.equal(challenge.data.maxApplicants, null);
  const sponsor = randomUUID(), background = randomUUID(), title = randomUUID();
  const structured = createInput.parse({ ...listing(), type: "CHALLENGE",
    prizes: [{ type: "CASH", description: "US$500" }, { type: "MENTORSHIP", description: "Expert mentoring" }],
    sponsorLogoIds: [sponsor], backgroundAssetId: background, titleAssetId: title, maxApplicants: 30,
  });
  assert.equal(structured.prizes.length, 2);
  assert.deepEqual(structured.sponsorLogoIds, [sponsor]);
  assert.equal(structured.maxApplicants, 30);
  for (const invalid of [
    { maxApplicants: 0 }, { maxApplicants: -1 }, { maxApplicants: 1.3 }, { maxApplicants: 1000001 },
    { sponsorLogoIds: [sponsor, sponsor] }, { sponsorLogoIds: ["https://untrusted.invalid/logo.png"] },
    { backgroundAssetId: "https://untrusted.invalid/bg.png" },
    { titleAssetId: "data:image/png;base64,xxx" },
    { prizes: [{ type: "UNKNOWN", description: "Gift" }] },
    { prizes: [{ type: "CASH", description: "" }] },
    { prizes: Array.from({ length: 9 }, () => ({ type: "CASH", description: "US$50" })) },
  ]) assert.equal(createInput.safeParse({ ...listing(), type: "CHALLENGE", ...invalid }).success, false);
  assert.equal(challengeAssetUploadInput.parse({ kind: "BACKGROUND" }).kind, "BACKGROUND");
  assert.equal(challengeAssetUploadInput.safeParse({ kind: "EXTERNAL" }).success, false);
  const illustrated = createInput.parse({ ...listing(), type: "CHALLENGE",
    coverImage: "SCHOOLS", topics: ["Education", "Coding"] });
  assert.deepEqual(illustrated.topics, ["Education", "Coding"]);
  assert.equal(illustrated.coverImage, "SCHOOLS");
  assert.equal(createInput.safeParse({ ...listing(), type: "CHALLENGE", topics: ["Coding", "Coding"] }).success, false);
  assert.equal(createInput.safeParse({ ...listing(), type: "CHALLENGE", topics: ["Coding", "Art", "Design", "Science"] }).success, false);
  assert.equal(createInput.safeParse({ ...listing(), type: "CHALLENGE", topics: ["Unapproved category"] }).success, false);
  assert.equal(createInput.safeParse({ ...listing(), type: "CHALLENGE", coverImage: "https://example.invalid/image.jpg" }).success, false);
  assert.equal(createInput.safeParse({ ...listing(), type: "CHALLENGE", prize: "x".repeat(121) }).success, false);
  assert.equal(createInput.safeParse({ ...listing(), type: "CHALLENGE", prize: null }).success, true, "legacy unset prizes are accepted");
  const submitted = { expectedVersion: 0, expectedOpportunityVersion: 1, action: "SUBMIT", shareProfile: true, answers: {} };
  assert.equal(applicationInput.parse(submitted).publicParticipant, false, "public profile display is opt-in");
  assert.equal(applicationInput.parse({ ...submitted, publicParticipant: true }).publicParticipant, true);
  assert.equal(applicationInput.safeParse({ ...submitted, publicParticipant: "true" }).success, false);
  assert.equal(saveInput.safeParse({ saved: true }).success, true);
  assert.equal(saveInput.safeParse({ saved: "true" }).success, false);
  assert.equal(saveInput.safeParse({ saved: true, accountId: randomUUID() }).success, false);
  for (const extra of [{ applicationUrl: "https://example.invalid" }, { applicationMethod: "EXTERNAL" }, { organizationId: randomUUID() }, { status: "PUBLISHED" }]) assert.equal(createInput.safeParse({ ...listing(), ...extra }).success, false);
  for (const questions of [[question("SINGLE_CHOICE")], [question("YES_NO", { options: ["Yes"] })], Array.from({ length: 6 }, () => question("FILE_UPLOAD"))]) assert.equal(createInput.safeParse({ ...listing(), questions }).success, false);
  const q = question("SHORT_ANSWER");
  assert.equal(createInput.safeParse({ ...listing(), questions: [q, q] }).success, false);
  assert.equal(applicationInput.safeParse({ expectedVersion: 0, expectedOpportunityVersion: 1, action: "SUBMIT", answers: {}, applicantId: randomUUID() }).success, false);
});
test("application validation distinguishes false from unanswered and checks choices, lengths and required attachments", () => {
  const yes = question("YES_NO"), choice = question("MULTIPLE_CHOICE", { options: ["Coding", "Writing"] }), file = question("FILE_UPLOAD"), short = question("SHORT_ANSWER");
  assert.doesNotThrow(() => validateAnswers([yes, choice, file], { [yes.id]: false, [choice.id]: ["Coding"] }, [{ questionId: file.id }], true));
  for (const [qs, answers, files] of [[[yes], {}, []], [[choice], { [choice.id]: ["Unknown"] }, []], [[choice], { [choice.id]: ["Coding", "Coding"] }, []], [[file], {}, []], [[short], { [short.id]: "a".repeat(501) }, []], [[yes], { [randomUUID()]: "hidden" }, []]]) assert.throws(() => validateAnswers(qs, answers, files, true), { status: 400 });
  assert.doesNotThrow(() => validateAnswers([yes, file], {}, [], false));
});
test("application storage never falls back to photo or identity buckets and validates PDF files", async () => {
  for (const config of [{}, { R2_BUCKET: "photos", R2_APPLICATION_BUCKET: "photos" }, { R2_IDENTITY_BUCKET: "identity", R2_APPLICATION_BUCKET: "identity" }]) assert.throws(() => createApplicationStorage({ config, client: {} }).check(), { status: 503 });
  await assert.rejects(processEvidence(Buffer.from("fake PDF"), "application/pdf"), { status: 415 });
  const pdf = await PDFDocument.create(); pdf.addPage(); const bytes = Buffer.from(await pdf.save());
  assert.equal((await processEvidence(bytes, "application/pdf")).contentType, "application/pdf");
});
test("opportunity routes require personal authentication, trusted origins, no-store and private file downloads", async () => {
  const accountId = randomUUID(), sessionId = randomUUID(), calls = [];
  const opportunities = new Proxy({}, { get: (_target, method) => async (...args) => {
    calls.push([method, args]);
    if (method === "readFile") return { bytes: Buffer.from("private"), contentType: "application/pdf" };
    if (method === "readChallengeAsset") return { bytes: Buffer.from("synthetic-image"), contentType: "image/webp" };
    if (method === "uploadChallengeAsset") return { id: randomUUID(), kind: args[2].kind, size: args[3].length };
    return { items: [] };
  } });
  const app = express(); app.use(express.json());
  app.use(createOpportunityRoutes({ opportunities, nodeEnv: "test", clientUrl: "http://localhost:5173", sessions: { authenticate: async token => { if (token !== "test") throw Object.assign(Error("Sign in"), { status: 401 }); return { account: { id: accountId }, sessionId }; } } }));
  app.use((e, _req, res, _next) => res.status(e.status || 500).json({ message: e.message }));
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + "/opportunities")).status, 401);
    const headers = { Cookie: "brightway_session=test", "Content-Type": "application/json" };
    for (const origin of [undefined, "https://foreign.invalid"]) assert.equal((await fetch(base + "/opportunities/" + randomUUID() + "/application", { method: "PUT", headers: { ...headers, ...(origin ? { Origin: origin } : {}) }, body: "{}" })).status, 403);
    assert.equal(calls.length, 0);
    const challengeId = randomUUID();
    const foreignSave = await fetch(base + "/opportunities/" + challengeId + "/save", { method: "PUT", headers: { ...headers, Origin: "https://foreign.invalid" }, body: JSON.stringify({ saved: true }) });
    assert.equal(foreignSave.status, 403);
    const saved = await fetch(base + "/opportunities/" + challengeId + "/save", { method: "PUT", headers: { ...headers, Origin: "http://localhost:5173" }, body: JSON.stringify({ saved: true }) });
    assert.equal(saved.status, 200);
    assert(calls.some(([method, args]) => method === "saveOpportunity" && args[1] === challengeId && args[2].saved === true));
    const response = await fetch(base + "/opportunities", { headers });
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.status, 200); assert.deepEqual(calls[0][1][0], { accountId, sessionId });
    const imageId = randomUUID();
    const anonymousImage = await fetch(base + "/opportunities/challenge-assets/" + imageId);
    assert.equal(anonymousImage.status, 401);
    const image = await fetch(base + "/opportunities/challenge-assets/" + imageId, { headers });
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("Content-Type"), "image/webp");
    assert.equal(image.headers.get("X-Content-Type-Options"), "nosniff");
    assert.equal(await image.text(), "synthetic-image");
    const foreignImage = await fetch(base + "/organization-workspace/" + randomUUID() +
      "/challenge-assets?kind=SPONSOR_LOGO", {
      method: "POST", headers: { Cookie: "brightway_session=test", Origin: "https://foreign.invalid",
        "Content-Type": "image/png" }, body: Buffer.from("test-image"),
    });
    assert.equal(foreignImage.status, 403);
    const uploaded = await fetch(base + "/organization-workspace/" + randomUUID() +
      "/challenge-assets?kind=SPONSOR_LOGO", {
      method: "POST", headers: { Cookie: "brightway_session=test", Origin: "http://localhost:5173",
        "Content-Type": "image/png" }, body: Buffer.from("test-image"),
    });
    assert.equal(uploaded.status, 201);
    assert.equal((await uploaded.json()).data.kind, "SPONSOR_LOGO");
    const file = await fetch(base + `/applications/me/${randomUUID()}/files/${randomUUID()}`, { headers });
    assert.match(file.headers.get("Content-Disposition"), /^attachment;/); assert.equal(file.headers.get("X-Content-Type-Options"), "nosniff"); assert.equal(await file.text(), "private");
    assert.equal(calls.at(-1)[1].at(-1), undefined, "owner file route does not accept an organization scope from the caller");
  } finally { await new Promise(resolve => server.close(resolve)); }
});
