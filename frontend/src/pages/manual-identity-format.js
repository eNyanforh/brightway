export const identityLabels = { NOT_STARTED: "Not requested", SUBMITTED: "Submitted", IN_REVIEW: "In review", APPROVED: "Approved", DECLINED: "Declined", ACTION_REQUIRED: "Changes requested", INVALIDATED: "New verification required", EXPIRED: "Expired" };
export const imageLabels = { GOVERNMENT_ID: "Government-issued ID", SELFIE: "Selfie" };
export function identityDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(+date) ? "—" : date.toLocaleString("en-GB", { timeZone: "Africa/Monrovia", dateStyle: "medium", timeStyle: "short" }) + " UTC";
}

export const identityRequirements = [
  { code: "PROFILE_COMPLETE_REQUIRED", label: "100% complete profile" },
  { code: "VERIFIED_EDUCATION_REQUIRED", label: "At least one verified education record" },
  { code: "VERIFIED_EXPERIENCE_REQUIRED", label: "At least one verified experience record" },
];
export function identityRequirementsMet(eligibility) {
  return eligibility?.requirementsMet === true && Array.isArray(eligibility.checks) &&
    identityRequirements.every(({ code }) => eligibility.checks.find((check) => check.code === code)?.satisfied === true);
}
