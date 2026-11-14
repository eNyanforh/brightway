import { expect, it } from "vitest";
import { challengeDeadlineReminder } from "../components/opportunities/challenge-deadline";

const NOW = Date.parse("2026-11-14T12:00:00Z");
const after = ms => new Date(NOW + ms).toISOString();
const day = 24 * 60 * 60 * 1000;

it("shows how many remaining days until a Challenge closes", () => {
  expect(challengeDeadlineReminder(after(5 * day), NOW)).toBe("Closes in 5 days");
  expect(challengeDeadlineReminder(after(day), NOW)).toBe("Closes in 1 day");
  expect(challengeDeadlineReminder(after(5 * day + 60_000), NOW)).toBe("Closes in 6 days");
});

it("handles less than one day, expired and invalid Challenge deadlines", () => {
  expect(challengeDeadlineReminder(after(day - 1), NOW)).toBe("Closes in less than 1 day");
  expect(challengeDeadlineReminder(after(60_000), NOW)).toBe("Closes in less than 1 day");
  expect(challengeDeadlineReminder(after(0), NOW)).toBe("Closed");
  expect(challengeDeadlineReminder(after(-day), NOW)).toBe("Closed");
  expect(challengeDeadlineReminder("invalid", NOW)).toBe("Closing date unavailable");
});

it("uses instants rather than local midnight or timezone conversions", () => {
  expect(challengeDeadlineReminder("2026-11-16T12:00:00+00:00", NOW)).toBe("Closes in 2 days");
  expect(challengeDeadlineReminder("2026-11-16T14:00:00+02:00", NOW)).toBe("Closes in 2 days");
});
