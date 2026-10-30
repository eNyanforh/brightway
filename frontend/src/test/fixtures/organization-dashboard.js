export function dashboardFixture(organizationId, days = 30, access = "allowed") {
  const asOf = "2026-10-30T12:00:00.000Z", from = new Date(asOf); from.setUTCHours(0, 0, 0, 0); from.setUTCDate(from.getUTCDate() - days + 1);
  const bucketDays = days === 90 ? 7 : 1;
  const trend = Array.from({ length: Math.ceil(days / bucketDays) }, (_, index) => ({ date: new Date(+from + index * bucketDays * 86400000).toISOString().slice(0, 10), submissions: index === 0 ? 7 : 0, decisions: index === 0 ? 3 : 0 }));
  return { organizationId, asOf, period: { days, from: from.toISOString(), to: asOf, timeZone: "UTC", bucketDays },
    team: access === "allowed" ? { access, data: { enabledMembers: 8, pendingInvitations: 2, expiringInvitations: 1 } } : { access },
    reviews: access === "allowed" ? { access, kinds: ["education", "experience"], data: { current: { SUBMITTED: 4, IN_REVIEW: 2, ACTION_REQUIRED: 1, VERIFIED: 10, UNABLE_TO_VERIFY: 2, FALSE_CREDENTIAL: 1 }, newClaims: 7, completedClaims: 3, outcomes: { VERIFIED: 2, UNABLE_TO_VERIFY: 1, FALSE_CREDENTIAL: 0 }, trend, unassigned: 4, pastTarget: 1, medianHours: 27.5 } } : { access },
  };
}
