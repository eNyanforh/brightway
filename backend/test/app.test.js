import test from "node:test";
import assert from "node:assert/strict";

test("the real application keeps entry points reachable and limits notification authentication to its own routes", async () => {
  // Invalid form input and missing cookies let these checks run without a database.
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
    const post = (path, headers = {}) => fetch(`${base}/api/v1${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:5173", ...headers }, body: "{}",
    });
    for (const path of ["/auth/register", "/auth/login"]) {
      const response = await post(path);
      assert.equal(response.status, 400, path);
      assert.equal((await response.json()).success, false);
    }
    const managementLogin = await post("/management/auth/login");
    assert.equal(managementLogin.status, 401);
    assert.match((await managementLogin.json()).message, /management authentication/);
    assert.equal((await post("/management/auth/login", { Origin: "https://foreign.invalid" })).status, 403);
    assert.equal((await fetch(`${base}/api/v1/organizations/not-an-id`)).status, 404);
    assert.equal((await fetch(`${base}/api/v1/unknown`)).status, 404);
    for (const path of ["/api/v1/profile/me", "/api/v1/profile/me/completion"]) {
      const unauthenticated = await fetch(`${base}${path}`);
      assert.equal(unauthenticated.status, 401);
      assert.equal(unauthenticated.headers.get("cache-control"), "no-store");
    }
    const managementOnly = { Cookie: "brightway-management=synthetic-management-cookie" };
    const privateResponses = [
      await fetch(`${base}/api/v1/notifications`, { headers: managementOnly }),
      await post("/profiles/someone/view", managementOnly),
      await post("/notifications/read-all", managementOnly),
      await post("/notifications/synthetic/read", managementOnly),
      await post("/notifications/synthetic/dismiss", managementOnly),
    ];
    for (const response of privateResponses) {
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await prisma.$disconnect();
  }
});
