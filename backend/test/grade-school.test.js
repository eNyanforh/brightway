import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import * as s from "../src/modules/grade-school/grade-school.schema.js";
import { createGradeSchoolRoutes } from "../src/modules/grade-school/grade-school.routes.js";
import express from "express";

test("Grade School validates calendar duration, dates, scores and strict period-specific input", () => {
  assert.throws(() => s.parse(s.year, { name: "Year", startsOn: "2026-01-01", endsOn: "2026-05-01" }), { status: 400 });
  assert.equal(s.parse(s.year, { name: "Year", startsOn: "2026-01-01", endsOn: "2026-05-02" }).endsOn.toISOString(), "2026-05-02T00:00:00.000Z");
  assert.throws(() => s.parse(s.year, { name: "Clamped month", startsOn: "2026-10-31", endsOn: "2027-02-28" }), { status: 400 });
  assert.equal(s.parse(s.year, { name: "Clamped month", startsOn: "2026-10-31", endsOn: "2027-03-01" }).endsOn.toISOString(), "2027-03-01T00:00:00.000Z");
  assert.throws(() => s.parse(s.period, { yearId: randomUUID(), name: "Term", kind: "TERM", startsOn: "2026-02-30", endsOn: "2026-04-01" }), { status: 400 });
  assert.throws(() => s.parse(s.subject, { name: "Math", passingMark: 101 }), { status: 400 });
  assert.throws(() => s.parse(s.subject, { name: "Math", passingMark: 50, campusId: randomUUID() }), { status: 400 });
  assert.throws(() => s.parse(s.schedule, { offeringId: randomUUID(), weekday: 2, startsAt: 900, endsAt: 899, room: "A" }), { status: 400 });
  assert.throws(() => s.parse(s.registration, { username: "student", periodId: randomUUID(), sectionId: randomUUID(), source: "ADMISSION" }), { status: 400 });
  assert.throws(() => s.parse(s.registration, { username: "student", periodId: randomUUID(), sectionId: randomUUID(), source: "DIRECT", admissionId: randomUUID() }), { status: 400 });
});
test("final submission requires a complete nonempty subject roster and rejects duplicates and outsiders", () => {
  const a = randomUUID(), b = randomUUID();
  s.completeRoster([{ id: a }, { id: b }], [{ registrationId: a }], false);
  assert.throws(() => s.completeRoster([{ id: a }, { id: b }], [{ registrationId: a }], true), { status: 400 });
  assert.throws(() => s.completeRoster([], [], true), { status: 400 });
  assert.throws(() => s.completeRoster([{ id: a }], [{ registrationId: b }], false), { status: 400 });
  assert.throws(() => s.parse(s.submission("attendance"), { expectedVersion: 1, finalize: true, records: [{ registrationId: a, status: "PRESENT" }, { registrationId: a, status: "ABSENT" }] }), { status: 400 });
  s.completeRoster([{ id: a }, { id: b }], [{ registrationId: a }, { registrationId: b }], true);
});
test("weighted grade reports normalize differing maximum scores and do not fabricate unassessed grades", () => {
  assert.deepEqual(s.calculateGrade([], 50), { percent: null, passingMark: 50, outcome: "NOT_ASSESSED", assessedWeight: 0 });
  assert.deepEqual(s.calculateGrade([{ score: 40, maxScore: 50, weight: 20 }, { score: 90, maxScore: 100, weight: 80 }], 50), { percent: 88, passingMark: 50, outcome: "PASS", assessedWeight: 100 });
  assert.equal(s.calculateGrade([{ score: 15, maxScore: 50, weight: 5 }], 50).outcome, "BELOW_PASS");
});
test("academic and learner endpoints require real sessions; mutations reject missing or foreign Origin", async t => {
  let called = 0;
  const accountId = randomUUID(), org = randomUUID();
  const sessions = { authenticate: async token => token === "valid" ? { account: { id: accountId }, sessionId: randomUUID() } : Promise.reject(s.fail(401, "Sign in required")) };
  const school = { setup: async () => { called++; return {}; }, configure: async () => { called++; return {}; }, myCampus: async () => { called++; return { items: [] }; } };
  const app = express(); app.use(express.json()); app.use(createGradeSchoolRoutes({ school, sessions, clientUrl: "http://localhost:5173", nodeEnv: "test" })); app.use((e, req, res, next) => res.status(e.status || 500).json({ message: e.message }));
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve)); t.after(() => server.close());
  const base = "http://127.0.0.1:" + server.address().port, path = `/organization-workspace/${org}/campus/grade-school/subjects`;
  assert.equal((await fetch(base + "/my-campus")).status, 401);
  const { createSessionCookieConfig } = await import("../src/modules/auth/session.http.js");
  const cookie = createSessionCookieConfig("test").name + "=valid";
  assert.equal((await fetch(base + "/my-campus", { headers: { cookie } })).status, 200);
  for (const origin of [undefined, "https://attacker.invalid"]) assert.equal((await fetch(base + path, { method: "POST", headers: { cookie, ...(origin ? { Origin: origin } : {}) } })).status, 403);
  assert.equal(called, 1);
  assert.equal((await fetch(base + path, { method: "POST", headers: { cookie, Origin: "http://localhost:5173" } })).status, 201);
});
