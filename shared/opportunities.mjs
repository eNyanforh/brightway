export const OPPORTUNITY_TYPES = Object.freeze({
  JOB: { label: "Job", plural: "Jobs", action: "Apply", icon: "work" },
  SCHOLARSHIP: { label: "Scholarship", plural: "Scholarships", action: "Apply", icon: "learning" },
  CHALLENGE: { label: "Challenge", plural: "Challenges", action: "Participate", icon: "awards" },
  EVENT: { label: "Event", plural: "Events", action: "Register", icon: "calendar" },
});
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
