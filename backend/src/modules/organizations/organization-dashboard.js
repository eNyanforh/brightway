import { z } from "zod";

const DAY = 86400000;
export const dashboardQuerySchema = z.strictObject({ days: z.enum(["7", "30", "90"]).default("30") });
export const dashboardStatuses = ["SUBMITTED", "IN_REVIEW", "ACTION_REQUIRED", "VERIFIED", "UNABLE_TO_VERIFY", "FALSE_CREDENTIAL"];
export function dashboardPeriod(days, timestamp) {
  const start = new Date(timestamp);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return { days, from: start.toISOString(), to: timestamp.toISOString(), timeZone: "UTC", bucketDays: days === 90 ? 7 : 1 };
}

// Database-side aggregates only: never fetch documents, names, evidence or entire queues.
export async function readTeamStatistics(db, organizationId, timestamp) {
  const [row] = await db.$queryRaw`
    SELECT
      (SELECT count(*)::int FROM "OrganizationMembership" WHERE "organizationId" = ${organizationId} AND enabled = true) AS "enabledMembers",
      (SELECT count(*)::int FROM "OrganizationInvitation" WHERE "organizationId" = ${organizationId} AND state = 'PENDING' AND "expiresAt" > (${timestamp.toISOString()}::timestamptz AT TIME ZONE 'UTC')) AS "pendingInvitations",
      (SELECT count(*)::int FROM "OrganizationInvitation" WHERE "organizationId" = ${organizationId} AND state = 'PENDING' AND "expiresAt" > (${timestamp.toISOString()}::timestamptz AT TIME ZONE 'UTC') AND "expiresAt" <= (${new Date(+timestamp + 2 * DAY).toISOString()}::timestamptz AT TIME ZONE 'UTC')) AS "expiringInvitations"`;
  return row;
}

export async function readReviewStatistics(db, { organizationId, personId, kinds, period, timestamp }) {
  const education = kinds.includes("education"), experience = kinds.includes("experience");
  const from = new Date(period.from), bucketDays = period.bucketDays;
  const [row] = await db.$queryRaw`
    WITH scoped AS MATERIALIZED (
      SELECT r.id, r.status, r."initialSubmittedAt", r."reviewerId"
      FROM "CredentialReview" r JOIN "Profile" p ON p.id = r."profileId"
      WHERE r."issuerOrganizationId" = ${organizationId} AND p."personId" <> ${personId}
        AND ((r.kind = 'education' AND ${education}) OR (r.kind = 'experience' AND ${experience}))
        AND r."initialSubmittedAt" <= (${timestamp.toISOString()}::timestamptz AT TIME ZONE 'UTC')
    ), completed AS MATERIALIZED (
      SELECT DISTINCT ON (a."reviewId") a."reviewId", a.status, a."decidedAt", s."initialSubmittedAt"
      FROM "CredentialAttempt" a JOIN scoped s ON s.id = a."reviewId"
      WHERE a."issuerOrganizationId" = ${organizationId}
        AND a.status IN ('VERIFIED', 'UNABLE_TO_VERIFY', 'FALSE_CREDENTIAL')
        AND a."decidedAt" >= (${from.toISOString()}::timestamptz AT TIME ZONE 'UTC') AND a."decidedAt" <= (${timestamp.toISOString()}::timestamptz AT TIME ZONE 'UTC')
        AND a."decidedAt" >= s."initialSubmittedAt"
      ORDER BY a."reviewId", a."decidedAt" DESC, a.id DESC
    ), activity AS (
      SELECT floor(extract(epoch FROM ("initialSubmittedAt" - (${from.toISOString()}::timestamptz AT TIME ZONE 'UTC'))) / (86400 * ${bucketDays}))::int AS bucket, count(*)::int AS submissions, 0::int AS decisions
        FROM scoped WHERE "initialSubmittedAt" >= (${from.toISOString()}::timestamptz AT TIME ZONE 'UTC') GROUP BY bucket
      UNION ALL
      SELECT floor(extract(epoch FROM ("decidedAt" - (${from.toISOString()}::timestamptz AT TIME ZONE 'UTC'))) / (86400 * ${bucketDays}))::int AS bucket, 0::int, count(*)::int
        FROM completed GROUP BY bucket
    )
    SELECT
      (SELECT coalesce(jsonb_object_agg(status, total), '{}'::jsonb) FROM (SELECT status, count(*)::int AS total FROM scoped GROUP BY status) c) AS current,
      (SELECT count(*)::int FROM scoped WHERE "initialSubmittedAt" >= (${from.toISOString()}::timestamptz AT TIME ZONE 'UTC')) AS "newClaims",
      (SELECT count(*)::int FROM completed) AS "completedClaims",
      (SELECT coalesce(jsonb_object_agg(status, total), '{}'::jsonb) FROM (SELECT status, count(*)::int AS total FROM completed GROUP BY status) o) AS outcomes,
      (SELECT coalesce(jsonb_agg(t ORDER BY bucket), '[]'::jsonb) FROM (SELECT bucket, sum(submissions)::int AS submissions, sum(decisions)::int AS decisions FROM activity GROUP BY bucket) t) AS trend,
      (SELECT count(*)::int FROM scoped WHERE status = 'SUBMITTED' AND "reviewerId" IS NULL) AS unassigned,
      (SELECT count(*)::int FROM scoped WHERE status IN ('SUBMITTED', 'IN_REVIEW') AND "initialSubmittedAt" <= (${new Date(+timestamp - 7 * DAY).toISOString()}::timestamptz AT TIME ZONE 'UTC')) AS "pastTarget",
      (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM ("decidedAt" - "initialSubmittedAt")) / 3600.0) FROM completed) AS "medianHours"`;
  const current = Object.fromEntries(dashboardStatuses.map(status => [status, row.current[status] ?? 0]));
  const outcomes = Object.fromEntries(["VERIFIED", "UNABLE_TO_VERIFY", "FALSE_CREDENTIAL"].map(status => [status, row.outcomes[status] ?? 0]));
  const byBucket = new Map(row.trend.map(point => [point.bucket, point]));
  const trend = Array.from({ length: Math.ceil(period.days / bucketDays) }, (_, bucket) => ({
    date: new Date(+from + bucket * bucketDays * DAY).toISOString().slice(0, 10),
    submissions: byBucket.get(bucket)?.submissions ?? 0, decisions: byBucket.get(bucket)?.decisions ?? 0,
  }));
  return { current, newClaims: row.newClaims, completedClaims: row.completedClaims, outcomes, trend,
    unassigned: row.unassigned, pastTarget: row.pastTarget, medianHours: row.medianHours === null ? null : Math.round(Number(row.medianHours) * 10) / 10 };
}
