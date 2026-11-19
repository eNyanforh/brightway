import test from "node:test";
import assert from "node:assert/strict";
import { scholarshipDeadlineToIso, formatDeadlineInZone } from "../../shared/opportunity-timezone.mjs";

test("Scholarship deadline is saved as the selected zone's UTC instant", () => {
  assert.equal(scholarshipDeadlineToIso("2027-01-26T12:00", "UTC"), "2027-01-26T12:00:00.000Z");
  assert.equal(scholarshipDeadlineToIso("2027-01-26T12:00", "Africa/Monrovia"), "2027-01-26T12:00:00.000Z");
  assert.equal(scholarshipDeadlineToIso("2027-01-26T12:00", "America/New_York"), "2027-01-26T17:00:00.000Z");
  assert.equal(formatDeadlineInZone("2027-01-26T17:00:00.000Z", "America/New_York"), "2027-01-26T12:00");
});
test("Scholarship timezone conversion rejects spring-forward nonexistent clock times", () => {
  assert.throws(() => scholarshipDeadlineToIso("2027-03-14T02:30", "America/New_York"), RangeError);
});
