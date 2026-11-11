import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { allowedEngines, assessEligibility, announcementInput, setupInput, settingsInput, transitionInput } from "../src/modules/campus/campus.schema.js";
import { createCampusRoutes } from "../src/modules/campus/campus.routes.js";

const verified = { type: "SCHOOL", offersTraining: true, status: "ACTIVE",
  request: { status: "APPROVED" }, verifiedAt: new Date(), locations: [{ countryCode: "LR", verifiedAt: new Date() }] };

test("Virtual Campus eligibility requires approved org, enabled product and verified Liberia operation", () => {
  assert.equal(assessEligibility(verified, { enabled: true }).eligible, true);
  assert.deepEqual(allowedEngines(verified), ["GRADE_SCHOOL", "TVET"]);
  assert.equal(assessEligibility({ ...verified, locations: [{ countryCode: "GH", verifiedAt: new Date() }] }, { enabled: true }).eligible, false);
  assert.equal(assessEligibility({ ...verified, locations: [{ countryCode: "LR", verifiedAt: null }] }, { enabled: true }).eligible, false);
  assert.equal(assessEligibility({ ...verified, locations: [{ countryCode: "GH", verifiedAt: new Date() }, { countryCode: "LR", verifiedAt: new Date() }] }, { enabled: true }).eligible, true);
  assert.equal(assessEligibility(verified, null).eligible, false);
  assert.equal(assessEligibility(verified, { enabled: false }).eligible, false);
  assert.equal(assessEligibility({ ...verified, status: "SUSPENDED" }, { enabled: true }).eligible, false);
  assert.equal(assessEligibility({ ...verified, type: "COMPANY", offersTraining: false }, { enabled: true }).eligible, false);
  assert.deepEqual(allowedEngines({ type: "COMPANY", offersTraining: true }), ["TVET"]);
});
test("Campus schema forbids academic enrolment, billing and unknown client fields", () => {
  const config = { engine: "GRADE_SCHOOL", expectedVersion: 0, displayName: "BrightWay School", contactEmail: null };
  assert.equal(setupInput.safeParse(config).success, true);
  for (const extra of [{ engine: "UNIVERSITY" }, { countryCode: "LR" }, { studentFee: 1 }, { autoActivate: true }, { admissionId: randomUUID() }])
    assert.equal(setupInput.safeParse({ ...config, ...extra }).success, false);
  assert.equal(setupInput.safeParse({ ...config, expectedVersion: -1 }).success, false);
  assert.equal(settingsInput.safeParse({ displayName: "School", contactEmail: "help@example.org", expectedVersion: 1 }).success, true);
  assert.equal(settingsInput.safeParse({ displayName: "School", contactEmail: "invalid", expectedVersion: 1 }).success, false);
  assert.equal(transitionInput.safeParse({ expectedVersion: 0 }).success, false);
  assert.equal(announcementInput.safeParse({ requestKey: randomUUID(), title: "Update", body: "Campus staff notice" }).success, true);
  assert.equal(announcementInput.safeParse({ requestKey: randomUUID(), title: "Update", body: "News", public: true }).success, false);
});
test("Campus HTTP paths are organization scoped, without student enrolment or charging routes", () => {
  const router = createCampusRoutes({ campus: {}, sessions: {}, clientUrl: "http://localhost:5173", nodeEnv: "test" });
  const paths = router.stack.filter(layer => layer.route).map(layer => layer.route.path);
  assert(paths.some(path => path.endsWith("/campus/activate")));
  assert(paths.some(path => path.endsWith("/campus/announcements")));
  assert(!paths.some(path => path.startsWith("/campus") || path.includes("/charge") || path.includes("/register")));
});
