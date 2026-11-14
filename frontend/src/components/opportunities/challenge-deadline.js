const DAY_MS = 24 * 60 * 60 * 1000;

// Count full or partial 24-hour periods still available to participate.
// Deadlines are ISO timestamps from the API and comparisons use absolute time,
// so the reminder does not shift with the viewer's timezone.
export function challengeDeadlineReminder(deadline, now = Date.now()) {
  const end = new Date(deadline).getTime();
  if (!Number.isFinite(end)) return "Closing date unavailable";
  const remaining = end - now;
  if (remaining <= 0) return "Closed";
  if (remaining < DAY_MS) return "Closes in less than 1 day";
  const days = Math.ceil(remaining / DAY_MS);
  return `Closes in ${days} ${days === 1 ? "day" : "days"}`;
}
