export const REQUIRED_DOCUMENT_PREFIX = "Required document: ";
export const OPTIONAL_DOCUMENT_PREFIX = "Optional document: ";
const DOCUMENT_FIELDS = Object.freeze({
  JOB: Object.freeze({
    requireCv: "CV / résumé",
    requireCoverLetter: "Cover letter",
    requirePortfolio: "Portfolio",
  }),
  SCHOLARSHIP: Object.freeze({
    requireTranscript: "Academic transcript",
    requireStatement: "Personal statement",
    requireRecommendation: "Recommendation letter",
    requireResearchProposal: "Research proposal",
    requireCv: "CV / résumé",
    requireAdmission: "Proof of admission",
  }),
});
export function requiredDocumentLabels(type, details = {}) {
  const defaults = Object.entries(DOCUMENT_FIELDS[type] || {})
    .filter(([key]) => details[key] === true).map(([, label]) => label);
  const additional = Array.isArray(details.additionalDocuments) ? details.additionalDocuments : [];
  return [...new Set([...defaults, ...additional.map(v => String(v).trim()).filter(Boolean)])];
}
export function optionalDocumentLabels(type, details = {}) {
  if (type !== "JOB") return [];
  return [
    ["cvStatus", "CV / résumé"],
    ["coverLetterStatus", "Cover letter"],
    ["portfolioStatus", "Portfolio"],
  ].filter(([key]) => details[key] === "optional").map(([, label]) => label);
}
export function isAutoDocumentQuestion(question) {
  return question?.type === "FILE_UPLOAD" && (question?.label?.startsWith(REQUIRED_DOCUMENT_PREFIX) || question?.label?.startsWith(OPTIONAL_DOCUMENT_PREFIX));
}
export function syncDocumentQuestions(type, details, questions, newId) {
  const existing = new Map(questions.filter(isAutoDocumentQuestion).map(q => [q.label, q]));
  const manual = questions.filter(q => !isAutoDocumentQuestion(q));
  const requested = [
    ...requiredDocumentLabels(type, details).map(label => ({ label: REQUIRED_DOCUMENT_PREFIX + label, required: true })),
    ...optionalDocumentLabels(type, details).map(label => ({ label: OPTIONAL_DOCUMENT_PREFIX + label, required: false })),
  ];
  return [...manual, ...requested.map(({ label, required }) =>
    existing.get(label) || { id: newId(), label, type: "FILE_UPLOAD", required, options: [] }
  )];
}
export function missingDocumentQuestions(type, details, questions) {
  return requiredDocumentLabels(type, details).filter(label => !questions.some(q =>
    q.label === REQUIRED_DOCUMENT_PREFIX + label &&
    q.type === "FILE_UPLOAD" && q.required && Array.isArray(q.options) && q.options.length === 0));
}
