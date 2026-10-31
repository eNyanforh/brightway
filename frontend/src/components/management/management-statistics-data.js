const count = value => Number.isSafeInteger(value) && value >= 0;
const groups = { accounts: ["total", "active", "suspended", "deactivated", "emailVerified", "mfaEnabled", "newLast7Days", "signedInLast7Days"], organizations: ["total", "active", "suspended", "schools", "companies", "ngos"], queues: ["organizations", "identities", "credentials"] };
export function validStatistics(value, accountId) {
  if (!value || value.accountId !== accountId || !Number.isFinite(Date.parse(value.asOf)) || value.period?.days !== 30 || value.period.timeZone !== "UTC" || value.period.to !== value.asOf || !Number.isFinite(Date.parse(value.period.from))) return false;
  if (Object.entries(groups).some(([group, fields]) => fields.some(field => !count(value[group]?.[field])))) return false;
  const { accounts: a, organizations: o } = value;
  return a.active + a.suspended + a.deactivated === a.total && o.active + o.suspended === o.total && o.schools + o.companies + o.ngos === o.total && [a.emailVerified, a.mfaEnabled, a.newLast7Days, a.signedInLast7Days].every(n => n <= a.total) && Array.isArray(value.registrations) && value.registrations.length === 30 && value.registrations.reduce((sum, point) => sum + point.count, 0) <= a.total && value.registrations.every((point, i) => count(point.count) && point.date === new Date(Date.parse(value.period.from) + i * 86400000).toISOString().slice(0, 10));
}
