import test from "node:test";
import assert from "node:assert/strict";
import { createAccountEmailService } from "../src/modules/auth/account-email.service.js";
import { profileView } from "../src/modules/profile/profile.service.js";
import { profilePatchSchema } from "../src/modules/profile/profile.schema.js";
import { projectContact } from "../src/modules/profile/profile-contact.js";

const secret = "test-only-account-email-secret-at-least-32-characters";
function fixture() {
  let time = new Date("2026-10-17T17:00:00Z");
  const state = { accounts: [
    { id: "account-a", personId: "person-a", email: "a@example.com", emailVerifiedAt: null, status: "ACTIVE" },
    { id: "account-b", personId: "person-b", email: "b@example.com", emailVerifiedAt: null, status: "ACTIVE" },
  ], challenges: [], limits: [] };
  function match(row, where) { return Object.entries(where).every(([key, value]) => row[key] === value); }
  function apply(row, data) {
    for (const [key, value] of Object.entries(data)) row[key] = value?.increment ? row[key] + value.increment : value;
    return row;
  }
  function model(key) {
    return {
      findUnique: async ({ where }) => state[key].find((row) => match(row, where)) ?? null,
      updateMany: async ({ where, data }) => {
        const rows = state[key].filter((row) => match(row, where)); rows.forEach((row) => apply(row, data)); return { count: rows.length };
      },
      update: async ({ where, data }) => apply(state[key].find((row) => match(row, where)), data),
      upsert: async ({ where, create, update }) => {
        let row = state[key].find((row) => match(row, where));
        if (row) apply(row, update); else { row = { ...create }; state[key].push(row); }
        return row;
      },
    };
  }
  const prisma = { account: model("accounts"), accountEmailChallenge: model("challenges"), signupEmailDeliveryLimit: model("limits") };
  let tail = Promise.resolve();
  prisma.$transaction = (fn) => {
    const task = tail.then(async () => {
      const before = structuredClone(state);
      try { return await fn(prisma); }
      catch (e) { Object.assign(state, before); throw e; }
    });
    tail = task.catch(() => {}); return task;
  };
  const deliveries = [];
  const sender = { check() {}, async send(data) { deliveries.push(data); } };
  const service = createAccountEmailService({ prisma, sender, secret, now: () => time, code: () => String(123450 + deliveries.length) });
  return { state, prisma, sender, service, deliveries, advance(ms) { time = new Date(time.getTime() + ms); } };
}

test("account email verifies only the authenticated owner's stored address and consumes its code once", async () => {
  const f = fixture();
  const sent = await f.service.request("person-a");
  assert.equal(sent.email, "a@example.com"); assert.equal(sent.retryAfterSeconds, 60);
  assert(!JSON.stringify(sent).includes("123450"));
  assert.equal(f.state.challenges[0].codeHash.length, 64);
  assert(!JSON.stringify(f.state).includes("123450"));
  await assert.rejects(f.service.verify("person-b", "123450"), { status: 400 });
  assert.equal(f.state.accounts[1].emailVerifiedAt, null);
  const result = await f.service.verify("person-a", "123450");
  assert.equal(result.verified, true); assert(result.emailVerifiedAt instanceof Date);
  assert.equal(f.state.accounts[0].email, "a@example.com");
  assert.equal(f.state.challenges[0].codeHash, null);
  await assert.rejects(f.service.verify("person-a", "123450"), { status: 400 });
  const again = await f.service.request("person-a"); assert.equal(again.verified, true);
  assert.equal(f.deliveries.length, 1);
});

test("account email commits wrong guesses and enforces the five-attempt budget under concurrent requests", async () => {
  const f = fixture(); await f.service.request("person-a");
  await Promise.allSettled(Array.from({ length: 8 }, () => f.service.verify("person-a", "000000")));
  assert.equal(f.state.challenges[0].attempts, 5);
  await assert.rejects(f.service.verify("person-a", "123450"), { status: 400 });
  assert.equal(f.state.accounts[0].emailVerifiedAt, null);
});

test("account email expires, replaces old codes on resend, and cannot survive a changed address or suspended account", async () => {
  const f = fixture(); await f.service.request("person-a");
  await assert.rejects(f.service.request("person-a"), { status: 429 });
  f.advance(60000); await f.service.request("person-a");
  await assert.rejects(f.service.verify("person-a", "123450"), { status: 400 });
  f.advance(600000); await assert.rejects(f.service.verify("person-a", "123451"), { status: 400 });
  await f.service.request("person-a");
  f.state.accounts[0].email = "changed@example.com";
  await assert.rejects(f.service.verify("person-a", "123452"), { status: 400 });
  f.state.accounts[0].email = "a@example.com"; f.state.accounts[0].status = "SUSPENDED";
  await assert.rejects(f.service.verify("person-a", "123452"), { status: 403 });
  assert.equal(f.state.accounts[0].emailVerifiedAt, null);
});

test("account delivery limits persist and exhausted reservations roll back", async () => {
  const f = fixture();
  for (let i = 0; i < 5; i++) { await f.service.request("person-a"); f.advance(60000); }
  await assert.rejects(f.service.request("person-a"), { status: 429 });
  assert.equal(f.state.limits[0].count, 5);
  assert.equal(f.deliveries.length, 5);
});

test("provider failure invalidates the challenge and a failed account write rolls proof consumption back", async () => {
  const f = fixture();
  f.sender.send = async () => { throw new Error("private provider response"); };
  await assert.rejects(f.service.request("person-a"), (e) => e.status === 503 && !e.message.includes("private"));
  assert.equal(f.state.challenges[0].codeHash, null);
  await assert.rejects(f.service.verify("person-a", "123450"), { status: 400 });
  f.advance(60000); f.sender.send = async (data) => { f.deliveries.push(data); };
  await f.service.request("person-a");
  const update = f.prisma.account.update;
  f.prisma.account.update = async () => { throw new Error("database write failed"); };
  await assert.rejects(f.service.verify("person-a", "123450"), /database write failed/);
  assert.equal(f.state.challenges[0].attempts, 0);
  assert.equal(f.state.accounts[0].emailVerifiedAt, null);
  f.prisma.account.update = update;
  await f.service.verify("person-a", "123450");
  assert(f.state.accounts[0].emailVerifiedAt);
});

test("missing email configuration fails closed without modifying an account", async () => {
  const f = fixture();
  const service = createAccountEmailService({ prisma: f.prisma, sender: f.sender, secret: "" });
  await assert.rejects(service.request("person-a"), { status: 503 });
  await assert.rejects(service.verify("person-a", "123450"), { status: 503 });
  assert.equal(f.state.challenges.length, 0);
  await assert.rejects(f.service.request("unknown-person"), { status: 403 });
});

test("profile completion requires verified email and a phone, allows optional WhatsApp and never grants identity verification", () => {
  const base = {
    version: 7, person: { phoneNumber: "+231770000000", account: { email: "owner@example.com", emailVerifiedAt: null } },
    educationMode: "NONE", experienceMode: "NONE", countryCode: "LR", region: "Montserrado", locality: "Monrovia", headline: "Student",
    careerFieldMode: "EXPLORING", skills: ["Communication"], interests: ["Technology"], photo: { id: "photo" },
  };
  const unverified = profileView(base);
  assert.equal(unverified.completion.complete, false);
  assert.deepEqual(unverified.completion.missing, [{ field: "contact.emailVerifiedAt", code: "EMAIL_VERIFICATION_REQUIRED" }]);
  const verified = profileView({ ...base, person: { ...base.person, account: { ...base.person.account, emailVerifiedAt: new Date() } } });
  assert.equal(verified.completion.profileVersion, 7);
  assert.deepEqual(verified.completion.missing, []);
  assert.equal(verified.completion.knownRequirementsComplete, true);
  assert.equal(verified.completion.complete, true); // Profile information is complete; identity review remains separate.
  assert.equal(verified.completion.eligibleToRequestVerification, false);
  assert(!verified.completion.unresolved.some((item) => item.code === "CONTACT_VERIFICATION_POLICY_PENDING"));
  assert(!verified.completion.checks.some((item) => item.field.includes("whatsapp")));
  assert.equal(profileView({ ...base, person: { ...base.person, phoneNumber: null } }).completion.complete, false);
  for (const changes of [{ contact: { emailVerifiedAt: new Date().toISOString() } }, { complete: true }, { completion: { complete: true } }]) {
    assert.equal(profilePatchSchema.safeParse({ expectedVersion: 7, changes }).success, false);
  }
  const publicContact = projectContact({ ...verified.contact, visibility: { email: "PUBLIC", phone: "ONLY_ME", whatsapp: "ONLY_ME" } });
  assert.deepEqual(publicContact, { email: "owner@example.com" });
});
