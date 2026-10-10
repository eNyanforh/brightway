import test from "node:test";
import assert from "node:assert/strict";

test("the real application mounts registration and preserves the health route", async () => {
  // No database queries are made: reject invalid registration before persistence.
  process.env.NODE_ENV = "test";
  process.env.CLIENT_URL = "http://localhost:5173";
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/brightway_test";
  const { default: app } = await import("../src/app.js");
  const { prisma } = await import("../src/config/database.js");
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await fetch(`${base}/api/v1/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).success, true);
    const response = await fetch(`${base}/api/v1/auth/register`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).success, false);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await prisma.$disconnect();
  }
});
