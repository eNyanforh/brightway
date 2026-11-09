const fullDate = new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeStyle: "short" });
const shortDate = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" });

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export function formatPostTime(value, now = Date.now()) {
  const created = new Date(value);
  const timestamp = created.getTime();
  if (!Number.isFinite(timestamp)) return { relative: "Date unavailable", exact: "" };
  const elapsed = Math.max(0, now - timestamp);
  let relative;
  if (elapsed < MINUTE) relative = "Just now";
  else if (elapsed < HOUR) relative = Math.floor(elapsed / MINUTE) + "m";
  else if (elapsed < DAY) relative = Math.floor(elapsed / HOUR) + "h";
  else if (elapsed < MONTH) relative = Math.floor(elapsed / DAY) + "d";
  else if (elapsed < YEAR) relative = Math.floor(elapsed / MONTH) + "mo";
  else if (elapsed < 2 * YEAR) relative = Math.floor(elapsed / YEAR) + "y";
  else relative = shortDate.format(created);
  return { relative, exact: fullDate.format(created) };
}

// Old posts need infrequent updates. A brand-new post needs a live seconds counter.
// Each visible card schedules only the next refresh it requires.
export function postTimeRefreshDelay(value, now = Date.now()) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  const elapsed = Math.max(0, now - timestamp);
  if (elapsed >= 2 * YEAR) return null;
  if (elapsed < MINUTE) return SECOND;
  if (elapsed < HOUR) return 30 * SECOND;
  if (elapsed < DAY) return MINUTE;
  if (elapsed < MONTH) return HOUR;
  if (elapsed < YEAR) return 6 * HOUR;
  return DAY;
}
