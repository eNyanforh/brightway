import test from "node:test";
import assert from "node:assert/strict";
import { opportunityInput } from "../src/modules/opportunities/opportunity.schema.js";

const future = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();
const base = {
  type: "JOB", title: "Junior Software Engineer",
  description: "Work with our engineering team to deliver reliable web applications.",
  location: "Monrovia, Liberia", workMode: "HYBRID",
  jobDetails: { type: "FULL_TIME", compensationType: "PAID", salaryMin: 500,
    salaryMax: 800, salaryCurrency: "USD", salaryPeriod: "MONTH" },
  deadline: future, questions: [],
};
test("Job Vacancy details parse and retain key fields", () => {
  const result = opportunityInput.parse({ ...base, details: {
    category: "Technology", experienceLevel: "JUNIOR", vacancies: 2,
    country: "Liberia", requiredSkills: ["React", "Node.js"],
    responsibilities: ["Build reliable application features"],
    requireCv: true, recruitmentStages: ["INTERVIEW"],
  } });
  assert.deepEqual(result.details.requiredSkills, ["React", "Node.js"]);
  assert.equal(result.details.requireCv, true);
});
test("Scholarship funding and eligibility details parse", () => {
  const result = opportunityInput.parse({ ...base,
    type: "SCHOLARSHIP", jobDetails: null,
    title: "Research Scholarship",
    details: {
      category: "RESEARCH", fundingType: "FULLY_FUNDED",
      academicLevels: ["MASTERS"], eligibleCountries: ["Liberia"],
      minAge: 18, maxAge: 40, requireTranscript: true,
      selectionCriteria: ["Academic merit", "Research motivation"],
    },
  });
  assert.equal(result.details.fundingType, "FULLY_FUNDED");
  assert.equal(result.details.requireTranscript, true);
});
test("Scholarship rejects impossible eligibility age range", () => {
  assert.throws(() => opportunityInput.parse({ ...base,
    type: "SCHOLARSHIP", jobDetails: null,
    details: { minAge: 50, maxAge: 18, fundingType: "FULLY_FUNDED" },
  }));
});
test("Opportunity details reject unknown properties", () => {
  assert.throws(() => opportunityInput.parse({ ...base, details: { secretExternalLink: "https://example.com" } }));
});
test("Legacy opportunities without metadata remain valid", () => {
  const result = opportunityInput.parse(base);
  assert.deepEqual(result.details, {});
});
