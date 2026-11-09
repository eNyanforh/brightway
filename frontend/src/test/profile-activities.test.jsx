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

it("shows complete posts in a title-free vertical feed, with engagement and pagination", async () => {
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
  const rail = screen.getByRole("region", { name: "Your posts" });
  expect(rail.className).toContain("bw-profile-activity-list");
  expect(screen.getByRole("region", { name: "Your community posts" }).contains(rail)).toBe(true);
  expect(within(rail).getAllByRole("article")).toHaveLength(2);
  expect(screen.queryByRole("heading", { name: "Activities" })).toBeNull();
  expect(screen.queryByText("All your published posts, with their details and engagement.")).toBeNull();
  expect(screen.queryByText("Browse your posts horizontally")).toBeNull();
  expect(screen.queryByRole("button", { name: "Next posts" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Previous posts" })).toBeNull();
  expect(screen.getByRole("link", { name: "All posts" }).getAttribute("href")).toBe("/posts");
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


it("offers Edit and Delete only through the three-dot menu, and updates then deletes an owned post", async () => {
  const owned = proof("11111111-1111-4111-8111-111111111111", "ACHIEVEMENT", "First achievement");
  let items = [owned];
  const fetchMock = vi.fn(async (url, options = {}) => {
    if (options.method === "PATCH") {
      const body = JSON.parse(options.body);
      expect(body).toEqual({
        expectedBody: "First achievement",
        expectedTags: ["Coding"],
        body: "Achievement updated after feedback",
        tags: ["Coding"],
      });
      items = [{ ...items[0], body: body.body }];
      return json({ post: items[0] });
    }
    if (options.method === "DELETE") {
      items = [];
      return json({ id: owned.id });
    }
    return json({ items, nextCursor: null });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<MemoryRouter><ProfileActivities accountId="me" /></MemoryRouter>);
  await screen.findByText("First achievement");
  expect(screen.queryByRole("button", { name: "Delete post" })).toBeNull();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Post options" }));
  const menu = screen.getByRole("menu", { name: "Manage post" });
  expect(within(menu).getByRole("menuitem", { name: "Edit post" })).toBeTruthy();
  expect(within(menu).getByRole("menuitem", { name: "Delete post" })).toBeTruthy();
  await user.click(within(menu).getByRole("menuitem", { name: "Edit post" }));
  const editor = screen.getByRole("dialog", { name: "Edit post" });
  const caption = within(editor).getByRole("textbox", { name: "Post description" });
  await user.clear(caption);
  await user.type(caption, "Achievement updated after feedback");
  await user.click(within(editor).getByRole("button", { name: "Save changes" }));
  await screen.findByText("Achievement updated after feedback");
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit post" })).toBeNull());

  await user.click(screen.getByRole("button", { name: "Post options" }));
  await user.click(screen.getByRole("menuitem", { name: "Delete post" }));
  const confirmation = screen.getByRole("dialog", { name: "Delete post" });
  expect(within(confirmation).getByText(/cannot be restored/)).toBeTruthy();
  expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "DELETE")).toHaveLength(0);
  await user.click(within(confirmation).getByRole("button", { name: "Cancel" }));
  expect(screen.getByText("Achievement updated after feedback")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Post options" }));
  await user.click(screen.getByRole("menuitem", { name: "Delete post" }));
  await user.click(within(screen.getByRole("dialog", { name: "Delete post" }))
    .getByRole("button", { name: "Delete post" }));
  expect(await screen.findByText("No activity yet")).toBeTruthy();
  expect(fetchMock.mock.calls.filter(([url, options]) =>
    url.endsWith("/posts/me/" + owned.id) && options?.method === "PATCH")).toHaveLength(1);
  expect(fetchMock.mock.calls.filter(([url, options]) =>
    url.endsWith("/posts/me/" + owned.id) && options?.method === "DELETE")).toHaveLength(1);
});

it("preserves an edited event's title, ticket, scheduling and approval settings", async () => {
  const event = proof("22222222-2222-4222-8222-222222222222", "EVENT", "Join us", {
    eventDetails: details,
    registration: { count: 0, registered: false }, eventAttendees: [],
  });
  const fetchMock = vi.fn(async (url, options = {}) =>
    options.method === "PATCH"
      ? json({ post: { ...event, ...JSON.parse(options.body) } })
      : json({ items: [event], nextCursor: null }));
  vi.stubGlobal("fetch", fetchMock);
  render(<MemoryRouter><ProfileActivities accountId="me" /></MemoryRouter>);
  await screen.findByText("Join us");
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Post options" }));
  await user.click(screen.getByRole("menuitem", { name: "Edit post" }));
  const dialog = screen.getByRole("dialog", { name: "Edit post" });
  expect(within(dialog).getByRole("textbox", { name: "Event title" }).value).toBe("Career workshop");
  expect(within(dialog).getByRole("spinbutton", { name: "Ticket price" }).value).toBe("25.00");
  expect(within(dialog).getByRole("checkbox", { name: "Require attendance approval" }).checked).toBe(true);
  await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([, options]) => options?.method === "PATCH")).toBe(true));
  const [, opts] = fetchMock.mock.calls.find(([, options]) => options?.method === "PATCH");
  const body = JSON.parse(opts.body);
  expect(body.eventDetails.title).toBe("Career workshop");
  expect(body.eventDetails.ticketPriceCents).toBe(2500);
  expect(body.eventDetails.requiresApproval).toBe(true);
  expect(body.eventDetails.startAt).toBe("2026-11-12T14:00:00.000Z");
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
