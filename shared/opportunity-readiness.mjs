import { requiredDocumentLabels, missingDocumentQuestions } from "./opportunity-documents.mjs";
export function opportunityPublicationIssues(opportunity, currentTime = Date.now()) {
  const { type, details: d = {}, questions = [], jobDetails } = opportunity;
  if (!["JOB", "SCHOLARSHIP"].includes(type)) return [];
  const issues = [];
  const need = (condition, message) => { if (!condition) issues.push(message); };
  const populated = s => typeof s === "string" && s.trim().length > 0;
  const list = items => Array.isArray(items) && items.some(populated);
  need(populated(opportunity.title) && opportunity.title.trim().length >= 3, "Enter an opportunity title.");
  need(populated(opportunity.description) && opportunity.description.trim().length >= 30, "Enter a description of at least 30 characters.");
  need(populated(opportunity.location) && opportunity.location.trim().length >= 2, "Enter the work or study location.");
  need(Number.isFinite(new Date(opportunity.deadline).getTime()) && new Date(opportunity.deadline).getTime() > +currentTime, "Choose a future application deadline.");
  if (type === "JOB") {
    need(Boolean(jobDetails?.type), "Choose a job type.");
    need(Boolean(jobDetails?.compensationType), "Choose a compensation type.");
    need(populated(d.category), "Select a job category.");
    need(populated(d.experienceLevel), "Select an experience level.");
    need(list(d.responsibilities), "Enter at least one job responsibility.");
    need(list(d.requiredQualifications), "Enter at least one required qualification.");
    if (d.applicationLimit != null)
      need(Number.isInteger(d.applicationLimit) && d.applicationLimit >= 1, "Application limit must be a positive whole number.");
  } else {
    need(populated(d.category), "Select a scholarship category.");
    need(list(d.academicLevels), "Select at least one academic level.");
    need(populated(d.fundingType), "Select a funding type.");
    need(list(d.eligibleCountries), "Enter at least one eligible country, or Worldwide.");
    need(list(d.selectionCriteria), "Enter at least one selection criterion.");
    if (d.openingDate && opportunity.deadline &&
        new Date(d.openingDate + "T00:00:00Z") > new Date(opportunity.deadline))
      issues.push("Application opening date must be before the deadline.");
  }
  const requirements = requiredDocumentLabels(type, d);
  need(requirements.length <= 12, "Limit required application documents to 12.");
  need(questions.length <= 20, "Limit application questions, including document uploads, to 20.");
  const missing = missingDocumentQuestions(type, d, questions);
  if (missing.length) issues.push("Document upload questions are missing: " + missing.join(", ") + ".");
  return issues;
}
