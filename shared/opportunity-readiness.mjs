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
    need(populated(d.category) || list(d.categories), "Select at least one job category.");
    need(populated(d.experienceLevel) || list(d.experienceLevels), "Select at least one experience level.");
    if (Array.isArray(d.experienceLevels) && d.experienceLevels.includes("NO_EXPERIENCE") && d.experienceMonths > 0)
      issues.push("No experience required cannot have a positive minimum experience.");
    need(list(d.responsibilities), "Enter at least one job responsibility.");
    if (d.applicationLimit != null)
      need(Number.isInteger(d.applicationLimit) && d.applicationLimit >= 1, "Application limit must be a positive whole number.");
  } else {
    need(populated(d.category), "Select a scholarship category.");
    need(list(d.academicLevels), "Select at least one academic level.");
    need(populated(d.fundingType), "Select a funding type.");
    if (d.fundingType === "FIXED_AMOUNT") {
      need(Number.isFinite(d.value) && d.value > 0, "Enter a positive scholarship amount.");
      need(["USD", "LRD", "EUR", "GBP"].includes(d.currency), "Select a currency for the fixed scholarship amount.");
    }
    need(list(d.eligibleCountries), "Enter at least one eligible country, or Worldwide.");
    need(list(d.selectionCriteria), "Enter at least one selection criterion.");
    if (d.openingDate && opportunity.deadline &&
        new Date(d.openingDate + "T00:00:00Z") > new Date(opportunity.deadline))
      issues.push("Application opening date must be before the deadline.");
    if (d.awardsAvailable != null)
      need(Number.isInteger(d.awardsAvailable) && d.awardsAvailable > 0, "Number of awards must be a positive whole number.");
    if (d.applicationLimit != null)
      need(Number.isInteger(d.applicationLimit) && d.applicationLimit > 0, "Maximum applicants must be a positive whole number.");
    if (d.reviewStartDate && d.reviewEndDate && d.reviewStartDate > d.reviewEndDate)
      issues.push("The review period end must not precede its start.");
    if (d.reviewEndDate && d.announcementDate && d.announcementDate < d.reviewEndDate)
      issues.push("Announcement date must not precede the end of review.");
    if (d.selectionMethod === "SCORING_RUBRIC") {
      const rows = Array.isArray(d.scoringRubric) ? d.scoringRubric : [];
      need(rows.length > 0 && rows.every(row => row.label?.trim() && Number.isInteger(row.weight) && row.weight >= 0) &&
        rows.reduce((total, row) => total + row.weight, 0) === 100,
        "Scoring rubric requires named criteria whose weights total 100%.");
    }
  }
  const requirements = requiredDocumentLabels(type, d);
  need(requirements.length <= 12, "Limit required application documents to 12.");
  need(questions.length <= 20, "Limit application questions, including document uploads, to 20.");
  const missing = missingDocumentQuestions(type, d, questions);
  if (missing.length) issues.push("Document upload questions are missing: " + missing.join(", ") + ".");
  return issues;
}
