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
