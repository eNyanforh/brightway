import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { rateLimit } from "express-rate-limit";
import { createAuthRoutes } from "../src/modules/auth/auth.routes.js";
import { createRegistrationService } from "../src/modules/auth/registration.service.js";
import { registrationSchema } from "../src/modules/auth/registration.schema.js";

const input = {
  firstName: " Emmanuel ", lastName: " Nyanforh ",
  username: " ENyanforh ", email: " Emmanuel@Example.com ",
  password: "A long personal passphrase!",
};

async function withApi(register, run, limiter) {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/auth", createAuthRoutes({ register, limiter }));
  app.use((error, req, res, next) => {
    void next;
    res.status(error.status ?? 500).json({ success: false, message: error.message });
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/auth/register`;
  const post = (body) => fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  try { await run(post); }
  finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test("registration normalizes identifiers without changing the password", () => {
  const result = registrationSchema.parse({ ...input, password: "  Keep all my spaces  " });
  assert.equal(result.username, "enyanforh");
  assert.equal(result.email, "emmanuel@example.com");
  assert.equal(result.firstName, "Emmanuel");
  assert.equal(result.password, "  Keep all my spaces  ");
});

test("invalid and privileged inputs are rejected before persistence", async () => {
  let calls = 0;
  await withApi(async () => { calls++; }, async (post) => {
    const invalid = [
      { ...input, password: "short" },
      { ...input, email: "invalid" },
      { ...input, firstName: " " },
      { ...input, username: "bad name" },
      { ...input, password: "a".repeat(129) },
      { ...input, status: "ACTIVE" },
      { ...input, role: "ADMIN" },
      null,
    ];
    for (const body of invalid) {
      const response = await post(body);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).success, false);
    }
  });
  assert.equal(calls, 0);
});

test("HTTP registration returns 201 with normalized input and a public account", async () => {
  await withApi(async (data) => {
    assert.equal(data.username, "enyanforh");
    assert.equal(data.email, "emmanuel@example.com");
    return { id: "account-id", username: data.username, person: { firstName: data.firstName } };
  }, async (post) => {
    const response = await post(input);
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.data.account.id, "account-id");
    assert.equal(JSON.stringify(body).includes(input.password), false);
    assert.equal(JSON.stringify(body).includes("passwordHash"), false);
  });
});

test("service uses one nested write and excludes credentials from its select", async () => {
  const register = createRegistrationService({
    hash: async (password) => { assert.equal(password, input.password); return "hashed-password"; },
    prisma: { account: { create: async ({ data, select }) => {
      assert.equal(data.passwordHash, "hashed-password");
      assert.equal("password" in data, false);
      assert.equal(data.person.create.firstName, "Emmanuel");
      assert.equal(select.passwordHash, undefined);
      assert.equal(select.person.select.phoneNumber, undefined);
      return { id: "created" };
    } } },
  });
  assert.equal((await register(registrationSchema.parse(input))).id, "created");
});

test("unique constraint failures become a 409 without database details", async () => {
  const register = createRegistrationService({
    hash: async () => "hash",
    prisma: { account: { create: async () => { throw Object.assign(new Error("private database details"), { code: "P2002" }); } } },
  });
  await withApi(register, async (post) => {
    const response = await post(input);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).message, "An account with these details already exists.");
  });
});

test("unexpected database failures are propagated", async () => {
  const failure = new Error("database unavailable");
  const register = createRegistrationService({ hash: async () => "hash", prisma: {
    account: { create: async () => { throw failure; } },
  } });
  await assert.rejects(register(registrationSchema.parse(input)), (error) => error === failure);
});

test("registration limits repeated attempts before running expensive work", async () => {
  let calls = 0;
  const limiter = rateLimit({ windowMs: 60000, limit: 2, standardHeaders: "draft-8", legacyHeaders: false });
  await withApi(async () => { calls++; return { id: "created" }; }, async (post) => {
    assert.equal((await post(input)).status, 201);
    assert.equal((await post(input)).status, 201);
    assert.equal((await post(input)).status, 429);
  }, limiter);
  assert.equal(calls, 2);
});
