import { z } from "zod";
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const statisticsCountsSchema = z.strictObject({
  accounts: z.strictObject({ total: count, active: count, suspended: count, deactivated: count, emailVerified: count, mfaEnabled: count, newLast7Days: count, signedInLast7Days: count }),
  organizations: z.strictObject({ total: count, active: count, suspended: count, schools: count, companies: count, ngos: count }),
  queues: z.strictObject({ organizations: count, identities: count, credentials: count }),
  registrations: z.array(z.strictObject({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), count })).length(30),
});
const DAY = 86400000;
export function statisticsPeriod(timestamp) {
  const from = new Date(timestamp); from.setUTCHours(0, 0, 0, 0); from.setUTCDate(from.getUTCDate() - 29);
  return { days: 30, timeZone: "UTC", from: from.toISOString(), to: timestamp.toISOString(), sevenDayFrom: new Date(+timestamp - 7 * DAY).toISOString() };
}

// One bound statement / one PostgreSQL statement snapshot. Account totals and growth
// share one account scan, with at most 31 groups. No person/evidence/contact data is read.
export async function readPlatformStatistics(db, timestamp) {
  const period = statisticsPeriod(timestamp), cutoff = timestamp.toISOString(), fromDay = period.from.slice(0, 10), toDay = cutoff.slice(0, 10);
  const [row] = await db.$queryRaw`
    WITH account_groups AS (
      SELECT CASE WHEN a."createdAt" >= (${period.from}::timestamptz AT TIME ZONE 'UTC') AND a."createdAt" <= (${cutoff}::timestamptz AT TIME ZONE 'UTC') THEN a."createdAt"::date END AS day,
        count(*) AS total,
        count(*) FILTER (WHERE a.status = 'ACTIVE') AS active,
        count(*) FILTER (WHERE a.status = 'SUSPENDED') AS suspended,
        count(*) FILTER (WHERE a.status = 'DEACTIVATED') AS deactivated,
        count(*) FILTER (WHERE a."emailVerifiedAt" <= (${cutoff}::timestamptz AT TIME ZONE 'UTC')) AS "emailVerified",
        count(*) FILTER (WHERE m.enabled = true) AS "mfaEnabled",
        count(*) FILTER (WHERE a."createdAt" >= (${period.sevenDayFrom}::timestamptz AT TIME ZONE 'UTC') AND a."createdAt" <= (${cutoff}::timestamptz AT TIME ZONE 'UTC')) AS "newLast7Days",
        count(*) FILTER (WHERE a."lastLoginAt" >= (${period.sevenDayFrom}::timestamptz AT TIME ZONE 'UTC') AND a."lastLoginAt" <= (${cutoff}::timestamptz AT TIME ZONE 'UTC')) AS "signedInLast7Days"
      FROM "Account" a LEFT JOIN "MfaFactor" m ON m."accountId" = a.id GROUP BY day
    ), totals AS (
      SELECT coalesce(sum(total), 0) AS total, coalesce(sum(active), 0) AS active,
        coalesce(sum(suspended), 0) AS suspended, coalesce(sum(deactivated), 0) AS deactivated,
        coalesce(sum("emailVerified"), 0) AS "emailVerified", coalesce(sum("mfaEnabled"), 0) AS "mfaEnabled",
        coalesce(sum("newLast7Days"), 0) AS "newLast7Days", coalesce(sum("signedInLast7Days"), 0) AS "signedInLast7Days" FROM account_groups
    ), organizations AS (
      SELECT count(*) AS total, count(*) FILTER (WHERE status = 'ACTIVE') AS active,
        count(*) FILTER (WHERE status = 'SUSPENDED') AS suspended, count(*) FILTER (WHERE type = 'SCHOOL') AS schools,
        count(*) FILTER (WHERE type = 'COMPANY') AS companies, count(*) FILTER (WHERE type = 'NGO') AS ngos FROM "Organization"
    )
    SELECT jsonb_build_object(
      'accounts', (SELECT to_jsonb(t) FROM totals t),
      'organizations', (SELECT to_jsonb(o) FROM organizations o),
      'queues', jsonb_build_object(
        'organizations', (SELECT count(*) FROM "OrganizationRequest" WHERE status IN ('SUBMITTED', 'ASSIGNED', 'RECOMMENDED')),
        'identities', (SELECT count(*) FROM "ManualIdentityRequest" WHERE state IN ('SUBMITTED', 'IN_REVIEW')),
        'credentials', (SELECT count(*) FROM "CredentialReview" WHERE status IN ('SUBMITTED', 'IN_REVIEW'))),
      'registrations', (SELECT jsonb_agg(jsonb_build_object('date', to_char(d.day, 'YYYY-MM-DD'), 'count', coalesce(g.total, 0)) ORDER BY d.day)
        FROM generate_series(${fromDay}::date, ${toDay}::date, interval '1 day') AS d(day)
        LEFT JOIN account_groups g ON g.day = d.day::date)
    ) AS statistics`;
  const parsed = statisticsCountsSchema.safeParse(row?.statistics);
  if (!parsed.success) throw Object.assign(Error("Platform statistics are temporarily unavailable."), { status: 503 });
  const { accounts, organizations, registrations } = parsed.data;
  if (accounts.active + accounts.suspended + accounts.deactivated !== accounts.total || organizations.active + organizations.suspended !== organizations.total || organizations.schools + organizations.companies + organizations.ngos !== organizations.total || [accounts.emailVerified, accounts.mfaEnabled, accounts.newLast7Days, accounts.signedInLast7Days].some(value => value > accounts.total) || registrations.reduce((sum, point) => sum + point.count, 0) > accounts.total || registrations.some((point, index) => point.date !== new Date(Date.parse(period.from) + index * DAY).toISOString().slice(0, 10))) throw Object.assign(Error("Platform statistics could not be verified."), { status: 503 });
  return { asOf: cutoff, period, ...parsed.data };
}
