/**
 * Convert a scholarship's entered wall-clock deadline in a named IANA timezone
 * to an exact UTC instant. Reject nonexistent times during daylight-saving jumps.
 */
function parts(instant, timezone) {
  const dateParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(instant));
  return Object.fromEntries(dateParts.filter(part => part.type !== "literal")
    .map(part => [part.type, Number(part.value)]));
}
export function formatDeadlineInZone(date, timezone) {
  const p = parts(new Date(date).getTime(), timezone);
  const pad = value => String(value).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
export function scholarshipDeadlineToIso(value, timezone) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new RangeError("Enter a valid scholarship deadline and time.");
  const [year, month, day, hour, minute] = value.split(/[-T:]/).map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  if (!Number.isFinite(target)) throw new RangeError("Invalid deadline.");
  // Correct the UTC candidate by its observed wall-clock difference.
  let instant = target;
  for (let i = 0; i < 4; i++) {
    const p = parts(instant, timezone);
    const observed = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    instant += target - observed;
  }
  if (formatDeadlineInZone(instant, timezone) !== value)
    throw new RangeError("This local time does not exist in the selected timezone.");
  return new Date(instant).toISOString();
}
