import test from "node:test";
import assert from "node:assert/strict";
import { opportunityInput } from "../src/modules/opportunities/opportunity.schema.js";
import { jobEmploymentLabel, jobSalaryLabel } from "../../shared/opportunities.mjs";

const basic = () => ({
  type: "JOB", title: "Research internship",
  description: "Learn practical research methods with a community research team.",
  location: "Monrovia", workMode: "IN_PERSON",
  deadline: "2099-12-01T12:00:00Z", questions: [],
});
const paid = () => ({
  employmentType: "INTERNSHIP", compensation: "PAID",
  salaryMin: 500, salaryMax: 1200, currency: "USD", payPeriod: "MONTH",
});

test("paid internships persist typed salary details and render accurate ranges", () => {
  const value = opportunityInput.parse({ ...basic(), jobDetails: paid() });
  assert.deepEqual(value.jobDetails, paid());
  assert.equal(jobEmploymentLabel(value.jobDetails), "Internship");
  assert.equal(jobSalaryLabel(value.jobDetails), "US$500–1,200 / month");
});
test("unpaid internships have no salary, and existing jobs without details remain valid", () => {
  const unpaid = { ...paid(), compensation: "UNPAID", salaryMin: null, salaryMax: null };
  assert.deepEqual(opportunityInput.parse({ ...basic(), jobDetails: unpaid }).jobDetails, unpaid);
  assert.equal(jobSalaryLabel(unpaid), "Unpaid");
  assert.deepEqual(opportunityInput.parse(basic()).jobDetails, {});
  assert.equal(jobSalaryLabel({}), null);
});
test("salary validation rejects inversions, zero pay, unpaid jobs with pay and unknown types", () => {
  for (const details of [
    { ...paid(), salaryMin: 1300 },
    { ...paid(), salaryMin: 0 },
    { ...paid(), salaryMax: null },
    { ...paid(), employmentType: "VOLUNTEER" },
    { ...paid(), compensation: "UNPAID" },
    { ...paid(), currency: "UNKNOWN" },
  ]) assert.equal(opportunityInput.safeParse({ ...basic(), jobDetails: details }).success, false);
});
