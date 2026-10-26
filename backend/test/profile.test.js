import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { profilePatchSchema } from "../src/modules/profile/profile.schema.js";
import { createProfileService, profileView } from "../src/modules/profile/profile.service.js";
import { evaluateProfileCompletion } from "../src/modules/profile/profile.completion.js";
import { createProfileRoutes } from "../src/modules/profile/profile.routes.js";

function database() {
  const rows = new Map();
  const calls = [];
  const people = new Map();
  const person = {
    async findUnique({ where }) { return structuredClone(people.get(where.id) ?? null); },
    async update({ where, data }) {
      const row = people.get(where.id);
      if (!row) throw new Error("Person not found");
      Object.assign(row, data); return structuredClone(row);
    },
  };
  const profile = {
    async findUnique(args) {
      calls.push(["find", args]);
      const row = rows.get(args.where.personId);
      return row ? structuredClone({ ...row, person: people.get(args.where.personId) ?? null }) : null;
    },
    async create(args) {
      calls.push(["create", args]);
      if (rows.has(args.data.personId)) throw Object.assign(new Error("unique"), { code: "P2002" });
      const row = { id: `profile-${args.data.personId}`, skills: [], interests: [], ...args.data };
      rows.set(row.personId, row);
      return structuredClone(row);
    },
    async updateMany(args) {
      calls.push(["update", args]);
      const row = rows.get(args.where.personId);
      if (!row || row.version !== args.where.version) return { count: 0 };
      const { version, ...changes } = args.data;
      Object.assign(row, changes, { version: row.version + version.increment });
      return { count: 1 };
    },
  };
  return { rows, people, calls, profile, person, async $transaction(fn) {
    const beforeRows = structuredClone(rows), beforePeople = structuredClone(people);
    try { return await fn({ profile, person }); } catch (error) {
      rows.clear(); people.clear();
      for (const [key, value] of beforeRows) rows.set(key, value);
      for (const [key, value] of beforePeople) people.set(key, value);
      throw error;
    }
  } };
}

test("profile drafts normalize text, validate countries, and allow partial fields to clear", () => {
  const parsed = profilePatchSchema.parse({ expectedVersion: 0, changes: {
    headline: "  Student  ", bio: "  ", location: { countryCode: " lr " },
    careerField: { mode: "EXPLORING" }, skills: [" Communication "],
  } });
  assert.equal(parsed.changes.headline, "Student");
  assert.equal(parsed.changes.bio, null);
  assert.equal(parsed.changes.location.countryCode, "LR");
  assert.deepEqual(parsed.changes.skills, ["Communication"]);
  assert.equal(profilePatchSchema.safeParse({ expectedVersion: 0, changes: { location: { countryCode: "XX" } } }).success, false);
  assert.equal(profilePatchSchema.safeParse({ expectedVersion: 0, changes: { headline: null } }).success, true);
});

test("profile validation rejects privilege injection, empty patches, duplicate entries and oversized values", () => {
  for (const changes of [
    { username: "new" }, { status: "ACTIVE" }, { verifiedAt: "now" },
    { personId: "other" }, { complete: true }, {}, { location: {} },
    { skills: ["Python", "python"] }, { interests: Array(21).fill("x") },
    { headline: "x".repeat(121) }, { careerField: { mode: "EXPLORING", label: "forged" } },
    { careerField: { mode: "SPECIFIED", label: " " } },
  ]) assert.equal(profilePatchSchema.safeParse({ expectedVersion: 0, changes }).success, false);
  for (const version of [-1, 1.5, "0", 2147483647]) {
    assert.equal(profilePatchSchema.safeParse({ expectedVersion: version, changes: { bio: null } }).success, false);
  }
});

test("read is side-effect free and returns a virtual empty draft for existing accounts", async () => {
  const db = database();
  const service = createProfileService({ prisma: db });
  assert.deepEqual(await service.read("owner"), profileView(null));
  assert.equal(db.rows.size, 0);
  assert.equal(db.calls[0][1].where.personId, "owner");
  assert.deepEqual(db.calls[0][1].select.person, { select: { phoneNumber: true, account: { select: { email: true, emailVerifiedAt: true, photoReviewRequired: true } } } });
  assert.equal(db.calls[0][1].select.account, undefined);
});

test("first save and later saves preserve omitted fields and scope writes to the owner", async () => {
  const db = database();
  const service = createProfileService({ prisma: db });
  const first = await service.patch("owner", profilePatchSchema.parse({ expectedVersion: 0, changes: {
    headline: "Student", location: { countryCode: "LR", locality: "Monrovia" },
    careerField: { mode: "SPECIFIED", label: "Technology" }, skills: ["Communication"],
  } }));
  assert.equal(first.version, 1);
  const second = await service.patch("owner", { expectedVersion: 1, changes: { bio: "My story" } });
  assert.equal(second.version, 2);
  assert.equal(second.headline, "Student");
  assert.equal(second.location.locality, "Monrovia");
  assert.deepEqual(second.careerField, { mode: "SPECIFIED", label: "Technology" });
  assert.equal((await service.read("other")).id, null);
  const update = db.calls.find(([type]) => type === "update")[1];
  assert.deepEqual(update.where, { personId: "owner", version: 1 });
});

test("stale saves cannot overwrite data and creation conflicts have a safe 409", async () => {
  const db = database();
  const service = createProfileService({ prisma: db });
  await service.patch("owner", { expectedVersion: 0, changes: { headline: "Original" } });
  await assert.rejects(service.patch("owner", { expectedVersion: 0, changes: { headline: "Stale" } }), { status: 409 });
  assert.equal((await service.read("owner")).headline, "Original");
  await assert.rejects(service.patch("other", { expectedVersion: 9, changes: { headline: "Invalid version" } }), { status: 409 });
  db.profile.create = async () => { throw Object.assign(new Error("private database details"), { code: "P2002" }); };
  await assert.rejects(service.patch("other", { expectedVersion: 0, changes: { bio: null } }), (error) => error.status === 409 && !error.message.includes("database"));
});

test("switching career field mode or clearing it removes the previous label", async () => {
  const db = database();
  const service = createProfileService({ prisma: db });
  await service.patch("owner", { expectedVersion: 0, changes: { careerField: { mode: "SPECIFIED", label: "Technology" } } });
  const exploring = await service.patch("owner", { expectedVersion: 1, changes: { careerField: { mode: "EXPLORING" } } });
  assert.deepEqual(exploring.careerField, { mode: "EXPLORING" });
  assert.equal(db.rows.get("owner").careerField, null);
  assert.equal((await service.patch("owner", { expectedVersion: 2, changes: { careerField: null } })).careerField, null);
});

test("completion checks the approved profile minimums without granting Verified eligibility", async () => {
  const empty = evaluateProfileCompletion(profileView(null));
  assert.equal(empty.missing.length, 11);
  const all = evaluateProfileCompletion(profileView({
    person: { phoneNumber: "+231770000000", account: { email: "owner@example.com", emailVerifiedAt: new Date("2026-01-01") } },
    educationMode: "NONE", experienceMode: "NONE",
    countryCode: "LR", region: "Montserrado", locality: "Monrovia", headline: "Student",
    careerFieldMode: "EXPLORING", skills: ["Communication"], interests: ["Technology"],
    photo: { id: "photo-id" },
  }));
  assert.deepEqual(all.missing, []);
  assert.equal(all.complete, true);
  assert.equal(all.eligibleToRequestVerification, false);
  assert.equal(all.evaluationStatus, "COMPLETE");
  assert(!all.unresolved.some((item) => item.code.includes("PHOTO_REVIEW")));
});

test("unexpected database errors propagate rather than pretending a save succeeded", async () => {
  const db = database();
  const failure = new Error("unavailable");
  db.profile.create = async () => { throw failure; };
  await assert.rejects(createProfileService({ prisma: db }).patch("owner", { expectedVersion: 0, changes: { bio: null } }), (error) => error === failure);
});

test("profile exposes a current photo without approval state or storage credentials", () => {
  const view = profileView({ photo: { id: "current-photo" } });
  assert.deepEqual(view.photo, { id: "current-photo" });
  assert.equal(view.photo.pending, undefined);
  assert.equal(view.photo.approved, undefined);
  assert.equal(view.photo.reviewStatus, undefined);
  assert.equal(view.photo.storageKey, undefined);
  const completion = evaluateProfileCompletion(view);
  assert(!completion.missing.some((entry) => entry.code === "PHOTO_REQUIRED"));
  assert.equal(completion.eligibleToRequestVerification, false);
  assert.equal(completion.complete, false);
});

test("HTTP routes require a session and trusted Origin, reject injected ownership, and return private drafts", async () => {
  const db = database();
  const app = express();
  app.use(express.json());
  const sessions = { async authenticate(token) {
    if (!["owner-session", "other-session"].includes(token)) throw Object.assign(new Error("Please log in to continue."), { status: 401 });
    return { account: { person: { id: token === "owner-session" ? "owner" : "other" } } };
  } };
  app.use("/api/v1/profile", createProfileRoutes({ profiles: createProfileService({ prisma: db }), sessions, clientUrl: "http://localhost:5173", nodeEnv: "test" }));
  app.use((error, req, res, next) => { void next; res.status(error.status ?? 500).json({ success: false, message: error.message }); });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/profile`;
  const headers = { Cookie: "brightway_session=owner-session", Origin: "http://localhost:5173", "Content-Type": "application/json" };
  const patch = (body, h = headers) => fetch(`${base}/me`, { method: "PATCH", headers: h, body: JSON.stringify(body) });
  try {
    assert.equal((await fetch(`${base}/me`)).status, 401);
    for (const origin of [undefined, "https://foreign.example"]) {
      const h = { ...headers }; if (origin) h.Origin = origin; else delete h.Origin;
      assert.equal((await patch({ expectedVersion: 0, changes: { headline: "Student" } }, h)).status, 403);
    }
    const unauth = { ...headers }; delete unauth.Cookie;
    assert.equal((await patch({ expectedVersion: 0, changes: { bio: null } }, unauth)).status, 401);
    assert.equal((await patch({ expectedVersion: 0, changes: { personId: "other" } })).status, 400);
    assert.equal((await patch({ expectedVersion: 0, changes: { headline: "Student" }, accountId: "other" })).status, 400);
    assert.equal(db.rows.size, 0);
    const saved = await patch({ expectedVersion: 0, changes: { headline: "Student" } });
    assert.equal(saved.status, 200);
    assert.equal(saved.headers.get("cache-control"), "no-store");
    assert.equal((await saved.json()).data.profile.version, 1);
    assert.equal((await patch({ expectedVersion: 0, changes: { headline: "Overwrite" } })).status, 409);
    const read = await fetch(`${base}/me`, { headers });
    const profile = (await read.json()).data.profile;
    assert.equal(profile.headline, "Student");
    assert.equal(profile.personId, undefined);
    assert.equal(profile.email, undefined);
    const otherHeaders = { ...headers, Cookie: "brightway_session=other-session" };
    assert.equal((await (await fetch(`${base}/me`, { headers: otherHeaders })).json()).data.profile.id, null);
    assert.equal((await patch({ expectedVersion: 0, changes: { headline: "Other person's draft" } }, otherHeaders)).status, 200);
    assert.equal((await (await fetch(`${base}/me`, { headers })).json()).data.profile.headline, "Student");
    const completion = await fetch(`${base}/me/completion`, { headers });
    assert.equal((await completion.json()).data.complete, false);
    assert.equal((await fetch(`${base}/other`, { headers })).status, 404);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
test("predefined interests are normalized server-side and new arbitrary values cannot be injected", async () => {
  const db = database(), service = createProfileService({ prisma: db });
  await assert.rejects(service.patch("owner", { expectedVersion: 0, changes: { interests: ["Unlisted arbitrary value"] } }), { status: 400 });
  assert.equal(db.rows.size, 0);
  const saved = await service.patch("owner", { expectedVersion: 0, changes: { interests: ["technology", "Education"] } });
  assert.deepEqual(saved.interests, ["Technology", "Education"]);
  await assert.rejects(service.patch("owner", { expectedVersion: 1, changes: { interests: ["Education", "New arbitrary value"] } }), { status: 400 });
  assert.equal((await service.read("owner")).version, 1);
  assert.deepEqual((await service.read("owner")).interests, ["Technology", "Education"]);
});

test("legacy interests may be retained or removed only by their existing owner", async () => {
  const db = database(), service = createProfileService({ prisma: db });
  db.rows.set("owner", { id: "legacy", personId: "owner", version: 1, skills: [], interests: ["Church Media"] });
  const retained = await service.patch("owner", { expectedVersion: 1, changes: { interests: ["Church Media", "Technology"] } });
  assert.deepEqual(retained.interests, ["Church Media", "Technology"]);
  await assert.rejects(service.patch("other", { expectedVersion: 0, changes: { interests: ["Church Media"] } }), { status: 400 });
  const cleared = await service.patch("owner", { expectedVersion: 2, changes: { interests: [] } });
  assert.deepEqual(cleared.interests, []);
  await assert.rejects(service.patch("owner", { expectedVersion: 3, changes: { interests: ["Church Media"] } }), { status: 400 });
  await assert.rejects(service.patch("owner", { expectedVersion: 1, changes: { interests: ["Technology"] } }), { status: 409 });
});

test("contact updates reuse Person phone and atomically preserve partial fields and stale-write protection", async () => {
  const db = database(), service = createProfileService({ prisma: db });
  db.people.set("owner", { phoneNumber: "+231770000000", account: { email: "owner@example.com" } });
  const virtual = await service.read("owner");
  assert.equal(virtual.contact.email, "owner@example.com"); assert.equal(virtual.contact.phoneNumber, "+231770000000"); assert.equal(db.rows.size, 0);
  assert.deepEqual(virtual.contact.visibility, { email: "ONLY_ME", phone: "ONLY_ME", whatsapp: "ONLY_ME" });
  const saved = await service.patch("owner", profilePatchSchema.parse({ expectedVersion: 0, changes: { contact: { phoneNumber: "+231 77 111 1111", whatsappNumber: "+231 88 222 2222", visibility: { phone: "CONNECTIONS" } } } }));
  assert.equal(db.people.get("owner").phoneNumber, "+231771111111");
  assert.equal(db.rows.get("owner").phoneNumber, undefined);
  assert.equal(saved.contact.whatsappNumber, "+231882222222");
  assert.equal(saved.contact.visibility.phone, "CONNECTIONS");
  const next = await service.patch("owner", { expectedVersion: 1, changes: { contact: { visibility: { email: "PUBLIC" } } } });
  assert.equal(next.contact.phoneNumber, saved.contact.phoneNumber); assert.equal(next.contact.visibility.phone, "CONNECTIONS");
  await assert.rejects(service.patch("owner", { expectedVersion: 1, changes: { contact: { phoneNumber: null } } }), { status: 409 });
  assert.equal(db.people.get("owner").phoneNumber, saved.contact.phoneNumber);
  const cleared = await service.patch("owner", { expectedVersion: 2, changes: { contact: { phoneNumber: null, whatsappNumber: null } } });
  assert.equal(cleared.contact.phoneNumber, null); assert.equal(cleared.contact.whatsappNumber, null);
  assert((await service.completion("owner")).missing.some((r) => r.code === "PHONE_REQUIRED"));
});

test("failure updating Person phone rolls back profile settings and version", async () => {
  const db = database(), service = createProfileService({ prisma: db });
  db.people.set("owner", { phoneNumber: "+231770000000", account: { email: "owner@example.com" } });
  await service.patch("owner", { expectedVersion: 0, changes: { headline: "Student" } });
  const failure = new Error("write unavailable"); db.person.update = async () => { throw failure; };
  await assert.rejects(service.patch("owner", { expectedVersion: 1, changes: { contact: { phoneNumber: "+231771111111", visibility: { email: "PUBLIC" } } } }), (error) => error === failure);
  const current = await service.read("owner");
  assert.equal(current.version, 1); assert.equal(current.contact.visibility.email, "ONLY_ME"); assert.equal(current.contact.phoneNumber, "+231770000000");
});

test("predefined skills normalize case and reject arbitrary additions without saving a partial update", async () => {
  const db = database(), service = createProfileService({ prisma: db });
  await assert.rejects(service.patch("owner", { expectedVersion: 0, changes: { skills: ["Unlisted arbitrary skill"], headline: "Must not persist" } }), { status: 400 });
  assert.equal(db.rows.has("owner"), false);
  const saved = await service.patch("owner", { expectedVersion: 0, changes: { skills: ["communication", "python"] } });
  assert.deepEqual(saved.skills, ["Communication", "Python"]);
  await assert.rejects(service.patch("owner", { expectedVersion: 1, changes: { skills: ["Python", "Unlisted skill"] } }), { status: 400 });
  assert.equal((await service.read("owner")).version, 1);
  assert.deepEqual((await service.read("owner")).skills, ["Communication", "Python"]);
});

test("legacy skills remain on their existing owner, may be removed, and cannot bypass stale versions or be added again", async () => {
  const db = database(), service = createProfileService({ prisma: db });
  db.rows.set("owner", { id: "legacy-skills", personId: "owner", version: 1, skills: ["Traditional Craft X"], interests: [] });
  const retained = await service.patch("owner", { expectedVersion: 1, changes: { skills: ["Traditional Craft X", "Communication"] } });
  assert.deepEqual(retained.skills, ["Traditional Craft X", "Communication"]);
  await assert.rejects(service.patch("other", { expectedVersion: 0, changes: { skills: ["Traditional Craft X"] } }), { status: 400 });
  const cleared = await service.patch("owner", { expectedVersion: 2, changes: { skills: [] } });
  assert.deepEqual(cleared.skills, []);
  await assert.rejects(service.patch("owner", { expectedVersion: 3, changes: { skills: ["Traditional Craft X"] } }), { status: 400 });
  await assert.rejects(service.patch("owner", { expectedVersion: 1, changes: { skills: ["Python"] } }), { status: 409 });
});

test("partial location saves re-evaluate county applicability from the merged owner profile", async () => {
  const db = database();
  db.people.set("owner", { phoneNumber: "+231770000000", account: { email: "owner@example.com", emailVerifiedAt: new Date("2026-01-01") } });
  db.rows.set("owner", {
    id: "profile-owner", personId: "owner", version: 3, countryCode: "LR", region: "Montserrado", locality: "Monrovia",
    headline: "Student", careerFieldMode: "EXPLORING", skills: ["Communication"], interests: ["Technology"],
    photo: { id: "photo" }, educationMode: "NONE", experienceMode: "NONE",
  });
  const service = createProfileService({ prisma: db });
  assert.equal((await service.read("owner")).completion.complete, true);
  const cleared = await service.patch("owner", profilePatchSchema.parse({ expectedVersion: 3, changes: { location: { region: null } } }));
  assert.equal(cleared.location.countryCode, "LR");
  assert.equal(cleared.completion.complete, false);
  assert(cleared.completion.missing.some((item) => item.code === "COUNTY_REQUIRED"));
  const international = await service.patch("owner", { expectedVersion: 4, changes: { location: { countryCode: "GH" } } });
  assert.equal(international.location.region, null);
  assert.equal(international.completion.complete, true);
  assert.equal(international.completion.profileVersion, 5);
  await assert.rejects(service.patch("owner", { expectedVersion: 4, changes: { location: { countryCode: "LR" } } }), { status: 409 });
  assert.equal((await service.read("owner")).location.countryCode, "GH");
  const returned = await service.patch("owner", { expectedVersion: 5, changes: { location: { countryCode: "LR" } } });
  assert.equal(returned.completion.complete, false);
  const county = await service.patch("owner", { expectedVersion: 6, changes: { location: { region: "Bong" } } });
  assert.equal(county.completion.complete, true);
  assert.equal(county.completion.eligibleToRequestVerification, false);
});

test("false credentials are excluded from profile display while the underlying record remains available for review audit", () => {
  const records = [{ id: "false", status: "FALSE_CREDENTIAL" }, { id: "draft", status: "DRAFT" }];
  const view = profileView({ educationMode: "RECORDS", educationRecords: records });
  assert.deepEqual(view.education.records, [{ id: "draft", status: "DRAFT" }]);
  assert.equal(records.length, 2);
});
