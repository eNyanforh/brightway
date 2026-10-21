import test from "node:test";
import assert from "node:assert/strict";
import { createSignupEmailService } from "../src/modules/auth/signup-email.service.js";
import { createSignupEmailSender } from "../src/modules/auth/signup-email.sender.js";
import { createRegistrationService } from "../src/modules/auth/registration.service.js";
import { draftHash } from "../src/modules/photos/photo.service.js";

const secret = "test-only-secret-at-least-thirty-two-characters";
const email = "test@example.com";
const token = "a".repeat(64);
function matches(row, where) {
  return Object.entries(where).every(([key, expected]) => {
    if (key === "OR") return expected.some((part) => matches(row, part));
    const value = row[key] ?? null;
    if (expected && typeof expected === "object" && !(expected instanceof Date)) {
      return Object.entries(expected).every(([op, wanted]) => op === "gt" ? value > wanted : op === "lt" ? value < wanted
        : op === "lte" ? value <= wanted : op === "not" ? value !== wanted : false);
    }
    return value === expected;
  });
}
function fixture() {
  let time = new Date("2026-10-17T02:00:00Z");
  const state = { drafts: [], limits: [] };
  function add(value = token) {
    state.drafts.push({ id: value.slice(0, 4), tokenHash: draftHash(value), expiresAt: new Date(time.getTime() + 1800000),
      emailSendCount: 0, emailCodeAttempts: 0 });
    return value;
  }
  add();
  function apply(row, data) {
    for (const [key, value] of Object.entries(data)) row[key] = value?.increment ? row[key] + value.increment : value;
    return row;
  }
  const prisma = {
    signupDraft: {
      findUnique: async ({ where }) => state.drafts.find((row) => matches(row, where)) ?? null,
      updateMany: async ({ where, data }) => {
        const rows = state.drafts.filter((row) => matches(row, where)); rows.forEach((row) => apply(row, data)); return { count: rows.length };
      },
      update: async ({ where, data }) => apply(state.drafts.find((row) => matches(row, where)), data),
    },
    signupEmailDeliveryLimit: {
      upsert: async ({ where, create, update }) => {
        let row = state.limits.find((row) => row.id === where.id);
        if (row) apply(row, update); else { row = { ...create }; state.limits.push(row); }
        return row;
      },
      deleteMany: async ({ where }) => {
        const old = state.limits.length; state.limits = state.limits.filter((row) => !matches(row, where)); return { count: old - state.limits.length };
      },
    },
  };
  let tail = Promise.resolve();
  prisma.$transaction = (fn) => {
    const task = tail.then(async () => {
      const before = structuredClone(state);
      try { return await fn(prisma); }
      catch (error) { Object.assign(state, before); throw error; }
    });
    tail = task.catch(() => {}); return task;
  };
  const deliveries = [];
  const sender = { check() {}, async send(data) { deliveries.push(data); } };
  const service = createSignupEmailService({ prisma, secret, sender, now: () => time, code: () => String(123450 + deliveries.length) });
  return { state, prisma, service, sender, deliveries, add, advance: (ms) => { time = new Date(time.getTime() + ms); } };
}

test("email proof is bound to the signup cookie and address, expires, and is consumed transactionally", async () => {
  const f = fixture();
  await assert.rejects(f.service.requireVerified(token, email), { status: 403 });
  const result = await f.service.request(token, email);
  assert.equal(result.retryAfterSeconds, 60);
  assert.equal(f.state.drafts[0].emailCodeHash.length, 64);
  assert(!JSON.stringify(f.state).includes(f.deliveries[0].code));
  await assert.rejects(f.service.verify("b".repeat(64), email, "123450"), { status: 400 });
  await assert.rejects(f.service.verify(token, "other@example.com", "123450"), { status: 400 });
  await f.service.verify(token, email, "123450");
  await assert.rejects(f.service.verify(token, email, "123450"), { status: 400 });
  await f.service.requireVerified(token, email);
  await assert.rejects(f.service.requireVerified(token, "other@example.com"), { status: 403 });
  await assert.rejects(f.prisma.$transaction(async (tx) => {
    await f.service.consume(tx, token, email); throw new Error("account failed");
  }), /account failed/);
  await f.service.requireVerified(token, email);
  const at = await f.prisma.$transaction((tx) => f.service.consume(tx, token, email));
  assert(at instanceof Date);
  await assert.rejects(f.service.requireVerified(token, email), { status: 403 });
});

test("wrong guesses persist and the fifth failure prevents a correct sixth guess", async () => {
  const f = fixture(); await f.service.request(token, email);
  for (let i = 0; i < 5; i++) await assert.rejects(f.service.verify(token, email, "000000"), { status: 400 });
  assert.equal(f.state.drafts[0].emailCodeAttempts, 5);
  await assert.rejects(f.service.verify(token, email, "123450"), { status: 400 });
  await assert.rejects(f.service.requireVerified(token, email), { status: 403 });
});

test("concurrent guesses cannot exceed the attempt budget or accept a replay", async () => {
  const f = fixture(); await f.service.request(token, email);
  await Promise.allSettled(Array.from({ length: 10 }, () => f.service.verify(token, email, "000000")));
  assert.equal(f.state.drafts[0].emailCodeAttempts, 5);
  f.advance(60000); await f.service.request(token, email);
  const results = await Promise.allSettled([f.service.verify(token, email, "123451"), f.service.verify(token, email, "123451")]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
});

test("code and verified proof expire independently and resending replaces the previous challenge", async () => {
  const f = fixture(); await f.service.request(token, email);
  await assert.rejects(f.service.request(token, email), { status: 429 });
  f.advance(60000); await f.service.request(token, email);
  await assert.rejects(f.service.verify(token, email, "123450"), { status: 400 });
  f.advance(600000); await assert.rejects(f.service.verify(token, email, "123451"), { status: 400 });
  await f.service.request(token, email); await f.service.verify(token, email, "123452");
  f.advance(600000); await assert.rejects(f.service.requireVerified(token, email), { status: 403 });
});

test("recipient limits persist across drafts and each draft has a total email budget", async () => {
  const f = fixture();
  for (let i = 0; i < 5; i++) { await f.service.request(token, email); f.advance(60000); }
  await assert.rejects(f.service.request(token, "another@example.com"), { status: 429 });
  const second = f.add("b".repeat(64));
  await assert.rejects(f.service.request(second, email), { status: 429 });
  assert.equal(f.deliveries.length, 5);
  assert.equal(f.state.drafts[1].emailSendCount, 0);
  assert.equal(f.state.limits[0].count, 5);
});

test("provider failures invalidate codes and missing configuration cannot send or verify", async () => {
  const f = fixture(); f.sender.send = async () => { throw new Error("private provider information"); };
  await assert.rejects(f.service.request(token, email), (e) => e.status === 503 && !e.message.includes("private"));
  assert.equal(f.state.drafts[0].emailCodeHash, null);
  await assert.rejects(f.service.verify(token, email, "123450"), { status: 400 });
  const missing = createSignupEmailService({ prisma: f.prisma, secret: "", sender: f.sender });
  await assert.rejects(missing.request(token, email), { status: 503 });
  await assert.rejects(missing.verify(token, email, "123450"), { status: 503 });
});

test("registration rejects unverified email before password hashing or account/photo writes", async () => {
  const f = fixture(); let hashed = false, wrote = false;
  const register = createRegistrationService({ prisma: f.prisma, verification: f.service,
    hash: async () => { hashed = true; }, photos: { registerAsset: async () => { wrote = true; } } });
  await assert.rejects(register({ email, password: "long-password" }, token), { status: 403 });
  assert.equal(hashed, false); assert.equal(wrote, false);
});

test("Resend adapter uses server credentials and never exposes rejected provider responses", async () => {
  let sent;
  const sender = createSignupEmailSender({ apiKey: "server-only-key", from: "BrightWay <no-reply@example.com>",
    fetcher: async (url, options) => { sent = { url, options }; return new Response(JSON.stringify({ id: "sent-id" })); } });
  await sender.send({ email, code: "001234", deliveryId: "unique" });
  assert.equal(sent.url, "https://api.resend.com/emails");
  assert.equal(sent.options.headers.Authorization, "Bearer server-only-key");
  assert.equal(sent.options.headers["Idempotency-Key"], "signup/unique");
  const body = JSON.parse(sent.options.body);
  assert.deepEqual(body.to, [email]); assert(body.text.includes("001234"));
  const broken = createSignupEmailSender({ apiKey: "key", from: "sender", fetcher: async () => new Response("private", { status: 403 }) });
  await assert.rejects(broken.send({ email, code: "123456", deliveryId: "id" }), (e) => e.status === 503 && !e.message.includes("private"));
});
