import { staffApi } from "./organization-staff";
import { ApiError } from "./auth";
const statuses = ["SUBMITTED", "IN_REVIEW", "ACTION_REQUIRED", "VERIFIED", "UNABLE_TO_VERIFY", "FALSE_CREDENTIAL"];
const count = n => Number.isSafeInteger(n) && n >= 0;
const totals = (object, keys) => object && keys.every(key => count(object[key]));
export async function readOrganizationDashboard(id, days, signal) {
  const data = await staffApi.dashboard(id, days, signal);
  const access = block => block && ["allowed", "permission_required", "mfa_required", "email_required"].includes(block.access);
  const reviews = data?.reviews?.data, team = data?.team?.data;
  if (data?.organizationId !== id || data?.period?.days !== days || data.period.timeZone !== "UTC" || !Number.isFinite(Date.parse(data.asOf)) ||
      !Number.isFinite(Date.parse(data.period.from)) || !Number.isFinite(Date.parse(data.period.to)) || ![1, 7].includes(data.period.bucketDays) ||
      !access(data.team) || !access(data.reviews) ||
      (data.team.access === "allowed" && !totals(team, ["enabledMembers", "pendingInvitations", "expiringInvitations"])) ||
      (data.reviews.access === "allowed" && (!Array.isArray(data.reviews.kinds) || !data.reviews.kinds.length || !data.reviews.kinds.every(kind => ["education", "experience"].includes(kind)) ||
        !totals(reviews, ["newClaims", "completedClaims", "unassigned", "pastTarget"]) || !totals(reviews.current, statuses) || !totals(reviews.outcomes, statuses.slice(3)) ||
        !(reviews.medianHours === null || (typeof reviews.medianHours === "number" && Number.isFinite(reviews.medianHours) && reviews.medianHours >= 0)) ||
        !Array.isArray(reviews.trend) || reviews.trend.length !== Math.ceil(days / data.period.bucketDays) ||
        !reviews.trend.every(point => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && totals(point, ["submissions", "decisions"]))))) {
    throw new ApiError("Dashboard statistics could not be verified. Refresh to try again.");
  }
  return data;
}
