import { expect, test } from "@playwright/test";

const origin = "http://127.0.0.1:4187";
const id = "11111111-1111-4111-8111-111111111111";
const postId = "33333333-3333-4333-8333-333333333333";
const member = { id, username: "synthetic", person: { firstName: "Synthetic", lastName: "Reader" } };
const author = { name: "Maya Cole", username: "maya", photoId: null, verified: true };
const question = { kind: "questions", name: "How does AI literacy improve schools?",
  summary: "Students can exchange learning ideas", tags: ["education"], member: author,
  createdAt: "2026-11-10T12:00:00Z", href: "/explore?source=member&post=" + postId };
const event = { ...question, kind: "events", name: "School innovation weekend", href: "/explore?source=member&post=44444444-4444-4444-8444-444444444444" };

test("search has separate content filters, real post links, and published opportunity discovery", async ({ page }) => {
  const errors = [];
  const calls = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const reply = data => route.fulfill({ json: { success: true, data } });
    switch (url.pathname) {
      case "/api/v1/learning/discover": return reply({ items: [], nextCursor: null });
      case "/api/v1/auth/me": return reply({ account: member });
      case "/api/v1/profile/me": return reply({ profile: { version: 1, photo: null, location: {}, skills: [], interests: [] } });
      case "/api/v1/work/access": return reply({ hasWork: false });
      case "/api/v1/search": return reply({ items: [{ kind: "people", name: "Maya Cole", username: "maya", href: "/maya" }], nextCursor: null });
      case "/api/v1/search/content": {
        const kind = url.searchParams.get("kind");
        calls.push(kind);
        return reply({ items: kind === "events" ? [event] : kind === "questions" ? [question] : [question, event], nextCursor: null });
      }
      default: return reply({ items: [], nextCursor: null });
    }
  });
  await page.goto("/search?q=school&kind=questions");
  const card = page.getByRole("link", { name: /How does AI literacy improve schools/ });
  await expect(card).toHaveAttribute("href", question.href);
  await expect(page.getByRole("img", { name: "Verified identity" })).toBeVisible();
  const filters = page.getByRole("navigation", { name: "Search filters" });
  await filters.getByRole("link", { name: "Events", exact: true }).click();
  await expect(page.getByRole("link", { name: /School innovation weekend/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /How does AI literacy improve schools/ })).toHaveCount(0);
  await filters.getByRole("link", { name: "All", exact: true }).click();
  await expect(page.getByRole("heading", { name: "People and organizations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Community content" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Maya Cole/ }).first()).toBeVisible();
  await filters.getByRole("link", { name: "Opportunities", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No opportunities found" })).toBeVisible();
  expect(calls).toEqual(["questions", "events", "all"]);
  expect(errors).toEqual([]);
});
