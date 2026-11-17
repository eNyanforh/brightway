export const REQUIRED_DOCUMENT_PREFIX = "Required document: ";
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
export function isAutoDocumentQuestion(question) {
  return question?.type === "FILE_UPLOAD" && question?.label?.startsWith(REQUIRED_DOCUMENT_PREFIX);
}
export function syncDocumentQuestions(type, details, questions, newId) {
  const existing = new Map(questions.filter(isAutoDocumentQuestion).map(q => [q.label, q]));
  const manual = questions.filter(q => !isAutoDocumentQuestion(q));
  return [...manual, ...requiredDocumentLabels(type, details).map(label => {
    const fullLabel = REQUIRED_DOCUMENT_PREFIX + label;
    return existing.get(fullLabel) || { id: newId(), label: fullLabel, type: "FILE_UPLOAD", required: true, options: [] };
  })];
}
export function missingDocumentQuestions(type, details, questions) {
  return requiredDocumentLabels(type, details).filter(label => !questions.some(q =>
    q.label === REQUIRED_DOCUMENT_PREFIX + label &&
    q.type === "FILE_UPLOAD" && q.required && Array.isArray(q.options) && q.options.length === 0));
}
