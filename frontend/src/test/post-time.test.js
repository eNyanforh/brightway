import { describe, expect, it } from "vitest";
import { formatPostTime, postTimeRefreshDelay } from "../components/posts/post-time";

const now = Date.parse("2026-11-09T12:00:00Z");
const earlier = delta => new Date(now - delta).toISOString();

describe("post timestamps", () => {
  it.each([
    [12_000, "12s"],
    [5 * 60_000, "5m"],
    [3 * 3_600_000, "3h"],
    [7 * 86_400_000, "7d"],
    [3 * 30 * 86_400_000, "3mo"],
    [400 * 86_400_000, "1y"],
  ])("uses appropriate relative units at %s ms", (age, expected) => {
    const value = formatPostTime(earlier(age), now);
    expect(value.relative).toBe(expected);
    expect(value.exact).toContain("202");
  });

  it("displays a dated year for older posts and preserves exact publication time", () => {
    const value = formatPostTime("2022-11-09T09:42:00Z", now);
    expect(value.relative).toMatch(/Nov\s+9,?\s+2022/);
    expect(value.exact).toContain("2022");
    expect(value.exact).toMatch(/9:42|09:42|AM/);
  });

  it("clamps future timestamps and fails safely for invalid dates", () => {
    expect(formatPostTime(earlier(-60_000), now).relative).toBe("0s");
    expect(formatPostTime("not-a-date", now)).toEqual({ relative: "Date unavailable", exact: "" });
    expect(postTimeRefreshDelay("not-a-date", now)).toBeNull();
  });

  it("refreshes new posts quickly and old posts infrequently", () => {
    expect(postTimeRefreshDelay(earlier(10_000), now)).toBe(1000);
    expect(postTimeRefreshDelay(earlier(300_000), now)).toBe(30_000);
    expect(postTimeRefreshDelay(earlier(3 * 3_600_000), now)).toBe(60_000);
    expect(postTimeRefreshDelay(earlier(3 * 365 * 86_400_000), now)).toBeNull();
  });
});
