import { expect, it } from "vitest";
import { challengeDeadlineReminder, opportunityDaysRemaining } from "../components/opportunities/challenge-deadline";

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

it("shows an exact days-remaining label for Jobs and other opportunities", () => {
  expect(opportunityDaysRemaining(after(5 * day), NOW)).toBe("5 days remaining");
  expect(opportunityDaysRemaining(after(day), NOW)).toBe("1 day remaining");
  expect(opportunityDaysRemaining(after(5 * day + 60_000), NOW)).toBe("6 days remaining");
  expect(opportunityDaysRemaining("2026-11-16T14:00:00+02:00", NOW)).toBe("2 days remaining");
});

it("handles partial days, expired and unavailable Job deadlines", () => {
  expect(opportunityDaysRemaining(after(day - 1), NOW)).toBe("Less than 1 day remaining");
  expect(opportunityDaysRemaining(after(0), NOW)).toBe("Closed");
  expect(opportunityDaysRemaining(after(-day), NOW)).toBe("Closed");
  expect(opportunityDaysRemaining("invalid", NOW)).toBe("Deadline unavailable");
});
