export const OPPORTUNITY_TYPES = Object.freeze({
  JOB: { label: "Job Vacancy", plural: "Job Vacancies", action: "Apply Now", icon: "work" },
  SCHOLARSHIP: { label: "Scholarship", plural: "Scholarships", action: "Apply Now", icon: "learning" },
  CHALLENGE: { label: "Challenge", plural: "Challenges", action: "Participate", icon: "awards" },
  EVENT: { label: "Event", plural: "Events", action: "Register", icon: "calendar" },
});
export const JOB_TYPES = Object.freeze({
  INTERNSHIP: "Internship",
  APPRENTICESHIP: "Apprenticeship",
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  FREELANCE: "Freelance",
  TEMPORARY: "Temporary",
  VOLUNTEER: "Volunteer",
});
export const JOB_COMPENSATION_TYPES = Object.freeze({
  PAID: "Paid",
  STIPEND: "Stipend",
  UNPAID: "Unpaid",
  NEGOTIABLE: "Negotiable",
});
export const JOB_SALARY_PERIODS = Object.freeze({
  HOUR: "hour",
  DAY: "day",
  WEEK: "week",
  BIWEEK: "two weeks",
  MONTH: "month",
  QUARTER: "quarter",
  YEAR: "year",
  ONE_TIME: "one-time payment",
  PROJECT: "project",
});
export function formatJobSalary(details) {
  if (!details || !["PAID", "STIPEND"].includes(details.compensationType)) return null;
  const { salaryMin, salaryMax, salaryCurrency, salaryPeriod } = details;
  if (!Number.isFinite(salaryMin) || !Number.isFinite(salaryMax) || !salaryCurrency || !salaryPeriod) return null;
  const symbol = { USD: "US$", LRD: "L$", EUR: "€", GBP: "£" }[salaryCurrency] || salaryCurrency + " ";
  const amount = value => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
  const value = salaryMin === salaryMax ? symbol + amount(salaryMin) : symbol + amount(salaryMin) + "–" + symbol + amount(salaryMax);
  return value + (salaryPeriod === "ONE_TIME" ? " (one-time)" : "/" + JOB_SALARY_PERIODS[salaryPeriod]);
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
