export const PROGRAM_TYPES = Object.freeze({ DEGREE: "Degree", DIPLOMA: "Diploma", CERTIFICATE: "Certificate", SHORT_COURSE: "Short course", TRAINING: "Training" });
export const STUDY_MODES = Object.freeze({ ON_CAMPUS: "On campus", ONLINE: "Online", HYBRID: "Hybrid" });
export const PROGRAM_STATUSES = Object.freeze({ DRAFT: "Draft", PUBLISHED: "Published", ARCHIVED: "Archived" });
export const CYCLE_STATUSES = Object.freeze({ DRAFT: "Draft", UPCOMING: "Upcoming", OPEN: "Open", CLOSED: "Closed", CANCELLED: "Cancelled" });
export const ADMISSION_STATUSES = Object.freeze({ DRAFT: "Draft", SUBMITTED: "Submitted", UNDER_REVIEW: "Under review", ACCEPTED: "Accepted", NOT_ACCEPTED: "Not accepted", WAITLISTED: "Waitlisted", WITHDRAWN: "Withdrawn" });
export function cycleStatus(cycle, now = new Date()) {
  if (!["UPCOMING", "OPEN"].includes(cycle.status)) return cycle.status;
  return new Date(cycle.deadline) <= now ? "CLOSED" : new Date(cycle.opensAt) > now ? "UPCOMING" : "OPEN";
}
