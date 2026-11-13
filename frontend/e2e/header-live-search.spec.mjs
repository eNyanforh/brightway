import { backgroundMessaging } from "./support/background-messaging.mjs";
import { expect, test } from "@playwright/test";

const origin = "http://127.0.0.1:4187";
const id = "11111111-1111-4111-8111-111111111111";
const account = { id, username: "synthetic", person: { firstName: "Synthetic", lastName: "Reader" } };
const person = { kind: "people", name: "Maya Cole", username: "maya", href: "/maya", headline: "Software developer" };

async function stub(page) {
  const calls = [];
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => {
    // Background channels are independent of this journey; SSE behavior has its own HTTP test.
    const background = backgroundMessaging(route); if (background) return background;
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const reply = data => route.fulfill({ json: { success: true, data } });
    switch (url.pathname) {
      case "/api/v1/auth/me": return reply({ account });
      case "/api/v1/work/access": return reply({ hasWork: false });
      case "/api/v1/profile/me": return reply({ profile: { version: 1, photo: null, location: {}, skills: [], interests: [] } });
      case "/api/v1/explore/posts": return reply({ items: [], nextCursor: null });
      case "/api/v1/search":
        calls.push({ path: url.pathname, q: url.searchParams.get("q") });
        return reply({ items: [person], nextCursor: null });
      case "/api/v1/search/content":
        calls.push({ path: url.pathname, q: url.searchParams.get("q") });
        return reply({ items: [], nextCursor: null });
      case "/api/v1/learning/discover":
      case "/api/v1/opportunities": return reply({ items: [], nextCursor: null });
      default: return reply({ items: [], nextCursor: null });
    }
  });
  return { calls, errors };
}

test("header search provides live matches and an accessible all-results link on desktop and mobile", async ({ page }) => {
  const { calls, errors } = await stub(page);
  await page.goto("/explore");
  const field = page.getByRole("searchbox", { name: "Search BrightWay content and people" });
  await field.fill("maya");
  await expect(page.getByRole("region", { name: "Search suggestions" }).getByRole("link", { name: /Maya Cole/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Search all for maya/ })).toHaveAttribute("href", "/search?q=maya");
  expect(calls.some(c => c.path === "/api/v1/search")).toBe(true);
  await page.getByRole("link", { name: /Search all for maya/ }).click();
  await expect(page).toHaveURL(/\/search\?q=maya$/);
  await expect(page.locator(".bw-directory-search-form")).toHaveCount(0);
  const rail = page.getByRole("complementary", { name: "Search discovery sidebar" });
  await expect(rail).toBeVisible();
  await expect(rail.locator(".bw-module-right-eyebrow, .bw-module-right-description")).toHaveCount(0);
  await expect(page.locator(".bw-design-brand-wordmark")).toHaveText("BRIGHTWAY");
  expect(errors).toEqual([]);
});

test("Search updates the URL while typing in its only header input on desktop and mobile", async ({ page }) => {
  const { calls, errors } = await stub(page);
  await page.goto("/search");
  const field = page.getByRole("searchbox", { name: "Search BrightWay content and people" });
  await expect(field).toBeVisible();
  await field.fill("software engineer");
  await expect(page).toHaveURL(/\/search\?q=software\+engineer/);
  await expect(page.getByRole("navigation", { name: "Search filters" })).toBeVisible();
  await expect(page.locator(".bw-directory-search-form")).toHaveCount(0);
  await expect(page.getByRole("search", { name: "Header search" })).toHaveCount(1);
  await expect.poll(() => calls.some(c => c.path === "/api/v1/search" && c.q === "software engineer")).toBe(true);
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page).toHaveURL(/\/search(?:\?kind=[a-z]+)?$/);
  expect(errors).toEqual([]);
});
