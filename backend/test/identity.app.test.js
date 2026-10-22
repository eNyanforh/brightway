import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

test("the real app preserves Persona raw-body bytes and mounts private identity routes without requiring provider configuration", async () => {
  process.env.NODE_ENV = "test"; process.env.CLIENT_URL = "http://localhost:5173";
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/brightway_test";
  process.env.PERSONA_WEBHOOK_SECRET = "test-only-secret"; process.env.PERSONA_API_KEY = "";
  const { default: app } = await import("../src/app.js");
  const { prisma } = await import("../src/config/database.js");
  const server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/identity`;
  try {
    assert.equal((await fetch(base)).status, 401);
    const raw = '{ "data": {"type":"event", "id":"evt_test"} }';
    const t = Math.floor(Date.now() / 1000), signature = `t=${t},v1=${createHmac("sha256", process.env.PERSONA_WEBHOOK_SECRET).update(`${t}.`).update(raw).digest("hex")}`;
    const response = await fetch(`${base}/persona/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "Persona-Signature": signature }, body: raw });
    // 503 is the missing provider configuration, after the raw-byte signature succeeds. No database call occurs.
    assert.equal(response.status, 503);
    assert.match((await response.json()).message, /temporarily unavailable/);
    assert.equal((await fetch(`${base}/persona/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "Persona-Signature": signature }, body: JSON.stringify(JSON.parse(raw)) })).status, 401);
  } finally { await new Promise((resolve) => server.close(resolve)); await prisma.$disconnect(); }
});
