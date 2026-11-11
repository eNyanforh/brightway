import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { createLearningRoutes } from "../src/modules/learning/learning.routes.js";
import * as input from "../src/modules/learning/learning.schema.js";
import { cycleStatus } from "../../shared/learning.mjs";
const program = { title: "Data analysis certificate", description: "Learn how to improve community education through data.", type: "CERTIFICATE", duration: "6 months", field: "Data science", studyMode: "ONLINE", countryCode: "GH", location: "Accra", requirements: "Secondary education" };
test("program and cycle schemas keep global admissions separate from campus and external applications", () => {
  assert.equal(input.createProgramInput.safeParse({ ...program, requestKey: randomUUID() }).success, true);
  for (const extra of [{ countryCode: "ZZ" }, { countryCode: "Liberia" }, { campusId: randomUUID() }, { status: "PUBLISHED" }, { applicationUrl: "https://example.invalid" }]) assert.equal(input.createProgramInput.safeParse({ ...program, requestKey: randomUUID(), ...extra }).success, false);
  const cycle = { programId: randomUUID(), title: "January intake", opensAt: "2030-01-01T00:00:00Z", deadline: "2030-02-01T00:00:00Z", questions: [], requestKey: randomUUID() };
  assert.equal(input.createInput.safeParse(cycle).success, true);
  for (const extra of [{ applicationUrl: "https://example.invalid" }, { organizationId: randomUUID() }, { enrolled: true }]) assert.equal(input.createInput.safeParse({ ...cycle, ...extra }).success, false);
  assert.equal(input.decisionInput.safeParse({ status: "ACCEPTED", expectedVersion: 1 }).success, true);
  assert.equal(input.decisionInput.safeParse({ status: "REGISTERED", expectedVersion: 1 }).success, false);
  assert.deepEqual(input.applicationTransitions.ACCEPTED, []);
});
test("admission opening and closing boundaries are enforced without a scheduled state update", () => {
  const cycle = { status: "UPCOMING", opensAt: "2030-01-01T00:00:00Z", deadline: "2030-02-01T00:00:00Z" };
  assert.equal(cycleStatus(cycle, new Date("2029-12-31T23:59:59Z")), "UPCOMING");
  assert.equal(cycleStatus(cycle, new Date(cycle.opensAt)), "OPEN");
  assert.equal(cycleStatus(cycle, new Date(cycle.deadline)), "CLOSED");
  assert.equal(cycleStatus({ ...cycle, status: "CANCELLED" }, new Date(cycle.opensAt)), "CANCELLED");
});
test("learning routes require personal authentication, trusted origins, no-store and private file downloads", async () => {
  const accountId = randomUUID(), sessionId = randomUUID(), calls = [];
  const learning = new Proxy({}, { get: (_target, method) => async (...args) => { calls.push([method, args]); return method === "readFile" ? { bytes: Buffer.from("private"), contentType: "application/pdf" } : { items: [] }; } });
  const app = express(); app.use(express.json());
  app.use(createLearningRoutes({ learning, nodeEnv: "test", clientUrl: "http://localhost:5173", sessions: { authenticate: async token => { if (token !== "test") throw Object.assign(Error("Sign in"), { status: 401 }); return { account: { id: accountId }, sessionId }; } } }));
  app.use((e, _req, res, _next) => res.status(e.status || 500).json({ message: e.message }));
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + "/admission-cycles")).status, 401);
    const headers = { Cookie: "brightway_session=test", "Content-Type": "application/json" };
    for (const origin of [undefined, "https://foreign.invalid"]) assert.equal((await fetch(base + "/admission-cycles/" + randomUUID() + "/application", { method: "PUT", headers: { ...headers, ...(origin ? { Origin: origin } : {}) }, body: "{}" })).status, 403);
    assert.equal(calls.length, 0);
    const response = await fetch(base + "/admission-cycles", { headers });
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.status, 200); assert.deepEqual(calls[0][1][0], { accountId, sessionId });
    const file = await fetch(base + `/admission-applications/me/${randomUUID()}/files/${randomUUID()}`, { headers });
    assert.match(file.headers.get("Content-Disposition"), /^attachment;/); assert.equal(file.headers.get("X-Content-Type-Options"), "nosniff"); assert.equal(await file.text(), "private");
    assert.equal(calls.at(-1)[1].at(-1), undefined, "owner file route does not accept an organization scope from the caller");
  } finally { await new Promise(resolve => server.close(resolve)); }
});
