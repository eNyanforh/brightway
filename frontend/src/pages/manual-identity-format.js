export const identityLabels = { NOT_STARTED: "Not requested", SUBMITTED: "Submitted", IN_REVIEW: "In review", APPROVED: "Approved", DECLINED: "Declined", ACTION_REQUIRED: "Changes requested", INVALIDATED: "New verification required", EXPIRED: "Expired" };
export const imageLabels = { GOVERNMENT_ID: "Government-issued ID", SELFIE: "Selfie" };
export function identityDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(+date) ? "—" : date.toLocaleString("en-GB", { timeZone: "Africa/Monrovia", dateStyle: "medium", timeStyle: "short" }) + " UTC";
}
