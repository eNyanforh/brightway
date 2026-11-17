import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createInput } from "../src/modules/opportunities/opportunity.schema.js";

const listing = type => ({
  type, title: "Research opportunities", description: "A dedicated learning and employment opportunity with clear requirements.",
  location: "Monrovia, Liberia", workMode: "IN_PERSON", deadline: "2099-12-01T12:00:00Z",
  questions: [], requestKey: randomUUID(),
});
const job = () => ({
  category: "Information Technology", experienceLevel: "ENTRY",
  responsibilities: ["Manage research data"], requiredQualifications: ["High school education"],
  documentQuestionIds: {}, benefits: ["Training"], requiredSkills: ["Data quality"],
});
const scholarship = () => ({
  category: "Research", academicLevels: ["Undergraduate"], fundingType: "FULL",
  eligibleCountries: ["Liberia"], selectionCriteria: "Selection is based on academic merit and eligibility.",
  tuitionCoverage: "100", documentQuestionIds: {},
});

test("dedicated Job Vacancy specifications validate and retain structured details", () => {
  const parsed = createInput.parse({
    ...listing("JOB"),
    jobDetails: { type: "APPRENTICESHIP", compensationType: "PAID", salaryMin: 100,
      salaryMax: 300, salaryCurrency: "USD", salaryPeriod: "WEEK" },
    jobSpecification: job(),
  });
  assert.equal(parsed.jobSpecification.category, "Information Technology");
  assert.deepEqual(parsed.jobSpecification.responsibilities, ["Manage research data"]);
  assert.equal(parsed.jobSpecification.vacancies, null);
  assert.equal(parsed.scholarshipSpecification, null);
  assert.equal(parsed.jobDetails.salaryPeriod, "WEEK");
  assert.equal(createInput.safeParse({ ...listing("JOB"), jobSpecification: { ...job(), responsibilities: [] } }).success, false);
  assert.equal(createInput.safeParse({ ...listing("JOB"), jobSpecification: { ...job(), experienceLevel: "UNKNOWN" } }).success, false);
  assert.equal(createInput.safeParse({ ...listing("JOB"), jobSpecification: { ...job(), applicationLimit: 0 } }).success, false);
});

test("Scholarship specifications validate funding, ages and legal document rules", () => {
  const docId = randomUUID();
  const q = { id: docId, label: "Academic Transcript", type: "FILE_UPLOAD", required: true, options: [] };
  const parsed = createInput.parse({ ...listing("SCHOLARSHIP"),
    scholarshipSpecification: { ...scholarship(), documentQuestionIds: { transcript: docId } }, questions: [q] });
  assert.equal(parsed.scholarshipSpecification.fundingType, "FULL");
  assert.deepEqual(parsed.scholarshipSpecification.academicLevels, ["Undergraduate"]);
  assert.equal(createInput.safeParse({ ...listing("SCHOLARSHIP"), scholarshipSpecification:
    { ...scholarship(), documentQuestionIds: { transcript: docId } }, questions: [] }).success, false);
  assert.equal(createInput.safeParse({ ...listing("SCHOLARSHIP"), scholarshipSpecification:
    { ...scholarship(), fundingType: "FIXED" } }).success, false);
  assert.equal(createInput.safeParse({ ...listing("SCHOLARSHIP"), scholarshipSpecification:
    { ...scholarship(), ageMin: 25, ageMax: 18 } }).success, false);
  assert.equal(createInput.safeParse({ ...listing("SCHOLARSHIP"), scholarshipSpecification:
    { ...scholarship(), tuitionCoverage: "CUSTOM" } }).success, false);
});

test("type-specific data cannot leak into other opportunities; legacy listings remain valid", () => {
  assert.equal(createInput.safeParse({ ...listing("JOB"), scholarshipSpecification: scholarship() }).success, false);
  assert.equal(createInput.safeParse({ ...listing("SCHOLARSHIP"), jobSpecification: job() }).success, false);
  assert.equal(createInput.safeParse({ ...listing("CHALLENGE"), jobSpecification: job() }).success, false);
  assert.equal(createInput.parse(listing("JOB")).jobSpecification, null);
  assert.equal(createInput.parse(listing("SCHOLARSHIP")).scholarshipSpecification, null);
});
