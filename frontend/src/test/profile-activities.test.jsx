import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import ProfileActivities from "../components/profile/ProfileActivities";

const json = (data, status = 200) => new Response(JSON.stringify({
  success: status === 200, ...(status === 200 ? { data } : { message: "Activity is temporarily unavailable." }),
}), { status, headers: { "Content-Type": "application/json" } });
const author = { name: "Test User", username: "test", photoId: null, verified: true };
const details = {
  startAt: "2026-11-12T14:00:00Z", endAt: "2026-11-12T16:00:00Z",
  timezone: "Africa/Monrovia", format: "IN_PERSON", venue: "Monrovia",
  title: "Career workshop", ticketPriceCents: 2500, currency: "USD",
  capacity: 50, requiresApproval: true,
};
const proof = (id, type, body, extras = {}) => ({
  id, type, createdAt: "2026-11-09T10:00:00Z", body,
  member: author, reaction: { count: 7, liked: false },
  views: 43, commentCount: 4, repostCount: 2, saved: false, reposted: false,
  tags: ["Coding"], ...extras,
});

afterEach(() => vi.unstubAllGlobals());

it("shows complete post cards in one horizontal row, with accurate metadata, engagement and pagination", async () => {
  const first = {
    items: [
      proof("11111111-1111-4111-8111-111111111111", "ACHIEVEMENT", "Finished a new learning project."),
      proof("22222222-2222-4222-8222-222222222222", "EVENT", "Join our career workshop.",
        { tags: ["Career"], eventDetails: details,
          registration: { count: 6, registered: false }, eventAttendees: [] }),
    ],
    nextCursor: "next-page",
  };
  const second = {
    items: [
      first.items[1],
      proof("33333333-3333-4333-8333-333333333333", "QUESTION",
        "How do I find a mentor?", {
          tags: ["Learning"], questionDetails: { title: "Finding a mentor" },
          answerCount: 3, answerParticipants: [],
        }),
    ],
    nextCursor: null,
  };
  const fetchMock = vi.fn(async url => json(url.includes("cursor=next-page") ? second : first));
  vi.stubGlobal("fetch", fetchMock);
  render(<MemoryRouter><ProfileActivities accountId="me" /></MemoryRouter>);

  await screen.findByText("Finished a new learning project.");
  const rail = screen.getByRole("region", { name: /Your posts/ });
  expect(rail.className).toContain("bw-profile-activity-list");
  expect(within(rail).getAllByRole("article")).toHaveLength(2);
  expect(within(rail).getByText("Career workshop")).toBeTruthy();
  expect(within(rail).getByText("USD 25.00")).toBeTruthy();
  expect(within(rail).getByText("Capacity:")).toBeTruthy();
  expect(within(rail).getByText("Approval required")).toBeTruthy();
  expect(within(rail).getByText("Coding")).toBeTruthy();
  expect(within(rail).getAllByRole("img", { name: "Verified identity" })).toHaveLength(2);
  expect(within(rail).getAllByText("Test User")).toHaveLength(2);
  expect(within(rail).getAllByLabelText("43 views")).toHaveLength(2);
  expect(within(rail).getAllByLabelText("4 comments")).toHaveLength(2);
  expect(within(rail).getAllByLabelText("2 reposts")).toHaveLength(2);
  expect(within(rail).getByLabelText("Event attendance").textContent).toContain("6 people attending");
  expect(within(rail).getAllByRole("link", { name: /View full post/ })[0].getAttribute("href"))
    .toBe("/explore?source=member&post=11111111-1111-4111-8111-111111111111");

  await userEvent.setup().click(screen.getByRole("button", { name: "Load older activity" }));
  await screen.findByText("How do I find a mentor?");
  expect(within(rail).getByText("Finding a mentor")).toBeTruthy();
  expect(within(rail).getAllByRole("article")).toHaveLength(3);
  expect(screen.queryByRole("button", { name: "Load older activity" })).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(2);

  await userEvent.setup().click(screen.getByRole("button", { name: "Refresh activity" }));
  await waitFor(() => expect(within(rail).getAllByRole("article")).toHaveLength(2));
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it("keeps real reactions interactive while showing server totals", async () => {
  const first = proof("11111111-1111-4111-8111-111111111111", "ACHIEVEMENT", "My project");
  const fetchMock = vi.fn(async (url, options) =>
    options?.method === "PUT"
      ? json({ reaction: { count: 8, liked: true } })
      : json({ items: [first], nextCursor: null }));
  vi.stubGlobal("fetch", fetchMock);
  render(<MemoryRouter><ProfileActivities accountId="me" /></MemoryRouter>);
  const celebrate = await screen.findByRole("button", { name: "Celebrate" });
  await userEvent.setup().click(celebrate);
  await waitFor(() => expect(celebrate.getAttribute("aria-pressed")).toBe("true"));
  expect(fetchMock.mock.calls.some(([url, options]) =>
    url.endsWith("/explore/posts/member/" + first.id + "/like") && options?.method === "PUT")).toBe(true);
});

it("shows retry on API failure and never invents activity data", async () => {
  let attempts = 0;
  vi.stubGlobal("fetch", vi.fn(async () => {
    attempts++;
    return attempts === 1 ? json(null, 503)
      : json({ items: [], nextCursor: null, access: {} });
  }));
  render(<MemoryRouter><ProfileActivities accountId="me" /></MemoryRouter>);
  expect((await screen.findByRole("alert")).textContent).toContain("Activity is temporarily unavailable.");
  expect(screen.queryByRole("article")).toBeNull();
  await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("No activity yet")).toBeTruthy();
  expect(attempts).toBe(2);
});
