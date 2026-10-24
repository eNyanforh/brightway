import test from "node:test";
import assert from "node:assert/strict";
import { evaluateManualVerificationEligibility as evaluate } from "../src/modules/profile/manual-verification.eligibility.js";
const history = (status) => ({ mode: "RECORDS", records: [{ status }] });
const profile = () => ({ education: history("VERIFIED"), experience: history("VERIFIED") });
test("requires profile completion even with both verified histories", () => {
  assert.equal(evaluate(profile(), false).requirementsMet, false);
  assert.equal(evaluate(profile(), "true").requirementsMet, false);
  assert.deepEqual(evaluate(profile(), false).missing, [{ code: "PROFILE_COMPLETE_REQUIRED" }]);
});
test("requires verified education and verified experience independently", () => {
  for (const kind of ["education", "experience"]) {
    for (const status of ["DRAFT", "PENDING", "ACTION_REQUIRED", "UNABLE_TO_VERIFY", "FALSE_CREDENTIAL", "verified", undefined]) {
      const value = profile();
      value[kind] = history(status);
      assert.equal(evaluate(value, true).requirementsMet, false);
    }
  }
});
test("no-history declarations and missing records do not meet verification requirements", () => {
  for (const kind of ["education", "experience"]) {
    for (const historyValue of [undefined, { mode: "NONE", records: [{ status: "VERIFIED" }] }, { mode: "RECORDS", records: [] }]) {
      const value = profile();
      value[kind] = historyValue;
      assert.equal(evaluate(value, true).requirementsMet, false);
    }
  }
});
test("one verified record per collection is sufficient without approving identity", () => {
  const value = profile();
  value.education.records.push({ status: "DRAFT" });
  const result = evaluate(value, true);
  assert.equal(result.requirementsMet, true);
  assert.deepEqual(result.missing, []);
  assert.equal(Object.hasOwn(result, "identityVerified"), false);
});
test("changing a credential decision immediately removes eligibility", () => {
  const value = profile();
  assert.equal(evaluate(value, true).requirementsMet, true);
  value.experience.records[0].status = "FALSE_CREDENTIAL";
  assert.equal(evaluate(value, true).requirementsMet, false);
});
