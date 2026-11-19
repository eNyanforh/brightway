import test from "node:test";
import assert from "node:assert/strict";
import { opportunityPublicationIssues } from "../../shared/opportunity-readiness.mjs";
import { requiredDocumentLabels, syncDocumentQuestions } from "../../shared/opportunity-documents.mjs";

const deadline = "2099-12-01T12:00:00.000Z";
const job = () => ({
  type: "JOB", title: "Research assistant",
  description: "Help support public health research and field data collection.",
  location: "Monrovia, Liberia", deadline, questions: [],
  jobDetails: { type: "FULL_TIME", compensationType: "PAID" },
  details: { category: "Research", experienceLevel: "ENTRY",
    responsibilities: ["Collect data"], requiredQualifications: ["High school completion"] },
});
test("publication requires a complete job vacancy but permits optional salary disclosure", () => {
  assert.deepEqual(opportunityPublicationIssues(job()), []);
  assert.match(opportunityPublicationIssues({ ...job(), details: {} })[0], /category/i);
});
test("scholarship readiness checks levels, country, funding, and selection criteria", () => {
  const base = { ...job(), type: "SCHOLARSHIP", jobDetails: null, details: {
    category: "RESEARCH", academicLevels: ["MASTERS"], fundingType: "FULLY_FUNDED",
    eligibleCountries: ["Liberia"], selectionCriteria: ["Academic achievement"],
  } };
  assert.deepEqual(opportunityPublicationIssues(base), []);
  assert.ok(opportunityPublicationIssues({ ...base, details: { ...base.details, eligibleCountries: [] } }).some(x => /eligible country/i.test(x)));
});
test("fixed-amount scholarships need a positive disclosed amount and supported currency", () => {
  const base = { ...job(), type: "SCHOLARSHIP", jobDetails: null, details: {
    category: "RESEARCH", academicLevels: ["MASTERS"], fundingType: "FIXED_AMOUNT",
    eligibleCountries: ["Liberia"], selectionCriteria: ["Academic achievement"],
  } };
  assert.ok(opportunityPublicationIssues(base).some(issue => /amount/i.test(issue)));
  assert.ok(opportunityPublicationIssues({ ...base, details: { ...base.details, value: 1000 } })
    .some(issue => /currency/i.test(issue)));
  assert.deepEqual(opportunityPublicationIssues({ ...base, details: {
    ...base.details, value: 1000, currency: "USD",
  } }), []);
});
test("document toggles produce deterministic required file questions and cannot be omitted at publication", () => {
  const details = { ...job().details, requireCv: true, requireCoverLetter: true };
  const missing = opportunityPublicationIssues({ ...job(), details });
  assert.ok(missing.some(v => /document upload/i.test(v)));
  let next = 0;
  const questions = syncDocumentQuestions("JOB", details, [], () => String(++next));
  assert.equal(questions.length, 2);
  assert.deepEqual(requiredDocumentLabels("JOB", details), ["CV / résumé", "Cover letter"]);
  assert.equal(questions.every(q => q.type === "FILE_UPLOAD" && q.required), true);
  assert.deepEqual(opportunityPublicationIssues({ ...job(), details, questions }), []);
  assert.deepEqual(syncDocumentQuestions("JOB", details, questions, () => "new"), questions);
});
test("required upload count is bounded and custom documents are not truncated", () => {
  const details = { ...job().details, additionalDocuments: Array.from({ length: 13 }, (_,i) => "Attachment " + i) };
  assert.equal(requiredDocumentLabels("JOB", details).length, 13);
  assert.ok(opportunityPublicationIssues({ ...job(), details }).some(v => /12/i.test(v)));
});

test("compact job publication accepts multi-select fields and optional additional qualifications", () => {
  const base = job();
  base.details = { categories: ["Research", "Education"], experienceLevels: ["ENTRY"],
    responsibilities: ["Coordinate field data collection"], education: "BACHELORS" };
  assert.deepEqual(opportunityPublicationIssues(base), []);
  assert.ok(opportunityPublicationIssues({ ...base, details: { ...base.details, experienceLevels: ["NO_EXPERIENCE"], experienceMonths: 24 } })
    .some(x => /no experience/i.test(x)));
});
test("optional application document questions stay optional and are not counted as mandatory", () => {
  const base = job();
  base.details = { ...base.details, requireCv: false, cvStatus: "optional" };
  const questions = syncDocumentQuestions("JOB", base.details, [], () => "optional-id");
  assert.deepEqual(questions.map(q => [q.label, q.required]), [["Optional document: CV / résumé", false]]);
  assert.deepEqual(requiredDocumentLabels("JOB", base.details), []);
  assert.deepEqual(opportunityPublicationIssues({ ...base, questions }), []);
});

test("scholarship scoring rubrics must total 100% and have named criteria", () => {
  const scholarship = { ...job(), type: "SCHOLARSHIP", jobDetails: null, details: {
    category: "RESEARCH", academicLevels: ["MASTERS"], fundingType: "FULLY_FUNDED",
    eligibleCountries: ["Liberia"], selectionCriteria: ["Academic achievement"],
    selectionMethod: "SCORING_RUBRIC",
    scoringRubric: [{ id: "11111111-1111-4111-8111-111111111111", label: "Academic merit", weight: 40 },
      { id: "22222222-2222-4222-8222-222222222222", label: "Financial need", weight: 30 }],
  } };
  assert.ok(opportunityPublicationIssues(scholarship).some(issue => /100%/.test(issue)));
  scholarship.details.scoringRubric[1].weight = 60;
  assert.deepEqual(opportunityPublicationIssues(scholarship), []);
});
test("scholarship award count, application cap and review dates have publication checks", () => {
  const scholarship = { ...job(), type: "SCHOLARSHIP", jobDetails: null, details: {
    category: "RESEARCH", academicLevels: ["MASTERS"], fundingType: "FULLY_FUNDED",
    eligibleCountries: ["Liberia"], selectionCriteria: ["Academic merit"],
    awardsAvailable: 0, applicationLimit: 0,
    reviewStartDate: "2099-11-20", reviewEndDate: "2099-11-19",
  } };
  const issues = opportunityPublicationIssues(scholarship);
  assert.ok(issues.some(issue => /awards/i.test(issue)));
  assert.ok(issues.some(issue => /applicants/i.test(issue)));
  assert.ok(issues.some(issue => /review period/i.test(issue)));
  scholarship.details = { ...scholarship.details,
    awardsAvailable: 10, applicationLimit: 100, reviewEndDate: "2099-11-21" };
  assert.deepEqual(opportunityPublicationIssues(scholarship), []);
});
