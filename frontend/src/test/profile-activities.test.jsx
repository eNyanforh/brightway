import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import ProfileActivities from "../components/profile/ProfileActivities";

const json = (data, status = 200) => new Response(JSON.stringify({
  success: status === 200, ...(status === 200 ? { data } : { message: "Activity is temporarily unavailable." }),
}), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

it("shows real achievements/events/questions, paginates without duplicates and links to original posts", async () => {
  const first = {
    items: [
      { id: "11111111-1111-4111-8111-111111111111", type: "ACHIEVEMENT",
        createdAt: "2026-11-09T10:00:00Z", body: "Finished a new learning project.",
        tags: ["Coding"] },
      { id: "22222222-2222-4222-8222-222222222222", type: "EVENT",
        createdAt: "2026-11-08T10:00:00Z", body: "Join our career workshop.",
        tags: ["Career"], eventDetails: { title: "Career workshop" } },
    ],
    nextCursor: "next-page",
  };
  const second = {
    items: [
      first.items[1],
      { id: "33333333-3333-4333-8333-333333333333", type: "QUESTION",
        createdAt: "2026-11-07T10:00:00Z", body: "How do I find a mentor?",
        tags: ["Learning"], questionDetails: { title: "Finding a mentor" } },
    ],
    nextCursor: null,
  };
  const fetchMock = vi.fn(async url => json(url.includes("cursor=next-page") ? second : first));
  vi.stubGlobal("fetch", fetchMock);
  render(<MemoryRouter><ProfileActivities accountId="me" /></MemoryRouter>);
  await screen.findByText("Finished a new learning project.");
  expect(screen.getByText("Career workshop")).toBeTruthy();
  expect(screen.getByText("Coding")).toBeTruthy();
  const firstPost = screen.getAllByRole("article")[0];
  expect(within(firstPost).getByRole("link", { name: /View post/ }).getAttribute("href"))
    .toBe("/explore?source=member&post=11111111-1111-4111-8111-111111111111");
  await userEvent.setup().click(screen.getByRole("button", { name: "Load older activity" }));
  await screen.findByText("How do I find a mentor?");
  expect(screen.getByText("Finding a mentor")).toBeTruthy();
  expect(screen.getAllByRole("article")).toHaveLength(3);
  expect(screen.queryByRole("button", { name: "Load older activity" })).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await userEvent.setup().click(screen.getByRole("button", { name: "Refresh activity" }));
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it("shows retry on API failure and never invents activity data", async () => {
  let attempts = 0;
  vi.stubGlobal("fetch", vi.fn(async () => {
    attempts++;
    return attempts === 1 ? json(null, 503)
      : json({ items: [], nextCursor: null, access: {} });
  }));
  render(<MemoryRouter><ProfileActivities accountId="me" /></MemoryRouter>);
  expect(await screen.findByRole("alert")).toHaveTextContent("Activity is temporarily unavailable.");
  expect(screen.queryByRole("article")).toBeNull();
  await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("No activity yet")).toBeTruthy();
  expect(attempts).toBe(2);
});
