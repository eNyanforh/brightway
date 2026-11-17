export const OPPORTUNITY_TYPES = Object.freeze({
  JOB: { label: "Job", plural: "Jobs", action: "Apply", icon: "work" },
  SCHOLARSHIP: { label: "Scholarship", plural: "Scholarships", action: "Apply", icon: "learning" },
  CHALLENGE: { label: "Challenge", plural: "Challenges", action: "Participate", icon: "awards" },
  EVENT: { label: "Event", plural: "Events", action: "Register", icon: "calendar" },
});
// Employment type and compensation are separate: an internship may be paid, stipended or unpaid.
export const JOB_EMPLOYMENT_TYPES = Object.freeze({
  FULL_TIME: "Full-time", PART_TIME: "Part-time", INTERNSHIP: "Internship",
  CONTRACT: "Contract", FREELANCE: "Freelance", TEMPORARY: "Temporary",
});
export const JOB_COMPENSATION_TYPES = Object.freeze({ PAID: "Paid", STIPEND: "Stipend", UNPAID: "Unpaid" });
export const JOB_PAY_PERIODS = Object.freeze({
  HOUR: "hour", WEEK: "week", MONTH: "month", YEAR: "year", ONE_TIME: "one-time",
});
export const JOB_SALARY_CURRENCIES = Object.freeze({
  USD: "US$", LRD: "L$", EUR: "€", GBP: "£", GHS: "GH₵", NGN: "₦",
});
export function jobEmploymentLabel(details) {
  return JOB_EMPLOYMENT_TYPES[details?.employmentType] || null;
}
export function jobSalaryLabel(details) {
  if (!details || !JOB_COMPENSATION_TYPES[details.compensation]) return null;
  if (details.compensation === "UNPAID") return "Unpaid";
  const { salaryMin, salaryMax, currency, payPeriod } = details;
  if (typeof salaryMin !== "number" || typeof salaryMax !== "number" ||
      !JOB_SALARY_CURRENCIES[currency] || !JOB_PAY_PERIODS[payPeriod]) {
    return details.compensation === "STIPEND" ? "Stipend · amount not listed" : "Salary not listed";
  }
  const format = value => new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
  const prefix = JOB_SALARY_CURRENCIES[currency];
  const range = salaryMin === salaryMax
    ? prefix + format(salaryMin)
    : prefix + format(salaryMin) + "–" + format(salaryMax);
  return (details.compensation === "STIPEND" ? "Stipend: " : "") +
    range + (payPeriod === "ONE_TIME" ? " (one-time)" : " / " + JOB_PAY_PERIODS[payPeriod]);
}

export const QUESTION_TYPES = Object.freeze({
  SHORT_ANSWER: "Short answer", LONG_ANSWER: "Long answer", YES_NO: "Yes / No",
  SINGLE_CHOICE: "Single choice", MULTIPLE_CHOICE: "Multiple choice", FILE_UPLOAD: "File upload",
});
export const APPLICATION_STATUSES = Object.freeze({
  DRAFT: "Draft", SUBMITTED: "Submitted", UNDER_REVIEW: "Under review", SHORTLISTED: "Shortlisted",
  SELECTED: "Selected", NOT_SELECTED: "Not selected", WITHDRAWN: "Withdrawn",
});
export const OPPORTUNITY_STATUSES = Object.freeze({
  DRAFT: "Draft", PUBLISHED: "Published", PAUSED: "Paused", CLOSED: "Closed", CANCELLED: "Cancelled", REMOVED: "Removed",
});
