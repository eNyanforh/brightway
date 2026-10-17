import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createSignupEmailRoutes } from "../src/modules/auth/signup-email.routes.js";

test("signup email HTTP requires Origin, validates strict input, binds the HttpOnly draft cookie and never returns a code", async () => {
  const calls = [];
  const app = express(); app.use(express.json());
  app.use("/auth", createSignupEmailRoutes({ clientUrl: "http://localhost:5173", nodeEnv: "test", verification: {
    request: async (...args) => { calls.push(args); return { retryAfterSeconds: 60 }; },
    verify: async (...args) => { calls.push(args); return { verified: true }; },
  } }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const post = (path, body, origin = "http://localhost:5173") => fetch(`http://127.0.0.1:${server.address().port}/auth/signup-email/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}), Cookie: `brightway_signup=${"a".repeat(64)}` }, body: JSON.stringify(body),
  });
  try {
    for (const origin of [null, "https://foreign.example"]) assert.equal((await post("request", { email: "user@example.com" }, origin)).status, 403);
    for (const body of [{ email: "bad" }, { email: "user@example.com", verified: true }, { email: "user@example.com", token: "forged" }]) {
      assert.equal((await post("request", body)).status, 400);
    }
    const response = await post("request", { email: " User@Example.com " });
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual((await response.json()).data, { retryAfterSeconds: 60 });
    assert.deepEqual(calls[0], ["a".repeat(64), "user@example.com", undefined]);
    assert.equal((await post("verify", { email: "user@example.com", code: "abc123" })).status, 400);
    assert.equal((await post("verify", { email: "user@example.com", code: "123456" })).status, 200);
    assert.deepEqual(calls[1], ["a".repeat(64), "user@example.com", "123456"]);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});