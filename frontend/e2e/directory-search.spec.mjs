import { expect, test } from "@playwright/test";

const origin = "http://127.0.0.1:4187";
const id = "11111111-1111-4111-8111-111111111111";
const account = { id, username: "synthetic", person: { firstName: "Synthetic", lastName: "Reader" } };
const person = { kind: "people", name: "Maya Cole", username: "maya", headline: "Student designer", verified: true, href: "/maya" };
const organization = { kind: "organizations", name: "Maya Learning Centre", username: "maya_learning", verified: true, href: "/organizations/" + id };

test("the personal header opens directory search and filters results on desktop and mobile", async ({ page, isMobile }) => {
  const searches = [];
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const reply = data => route.fulfill({ json: { success: true, data } });
    switch (url.pathname) {
      case "/api/v1/auth/me": return reply({ account });
      case "/api/v1/profile/me": return reply({ profile: { version: 1, photo: null, location: {}, skills: [], interests: [] } });
      case "/api/v1/work/access": return reply({ hasWork: false });
      case "/api/v1/explore/posts": return reply({ items: [], nextCursor: null });
      case "/api/v1/learning/discover":
      case "/api/v1/opportunities": return reply({ items: [], nextCursor: null });
      case "/api/v1/search/content": return reply({ items: [], nextCursor: null });
      case "/api/v1/search": {
        const query = Object.fromEntries(url.searchParams);
        searches.push(query);
        if (query.kind === "organizations") return reply({ items: [organization], nextCursor: null });
        if (query.cursor) return reply({ items: [organization], nextCursor: null });
        return reply({ items: [person], nextCursor: "synthetic-page" });
      }
      default: throw Error("Unexpected synthetic request " + url.pathname);
    }
  });
  await page.goto("/explore");
  if (isMobile) {
    await page.getByRole("link", { name: "Search BrightWay" }).click();
    await expect(page.getByRole("searchbox", { name: "Search BrightWay content and people" })).toBeVisible();
  }
  const field = page.getByRole("searchbox", { name: "Search BrightWay content and people" });
  await field.fill("maya");
  expect(searches).toEqual([]);
  await field.press("Enter");
  await expect(page.getByRole("search", { name: "Header search" })).toHaveCount(1);
  await expect(page.locator(".bw-directory-search-form")).toHaveCount(0);
  await expect(page.locator(".bw-directory-hero")).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Search discovery sidebar" })).toHaveCount(1);
  await expect(page.getByRole("link", { name: /Maya Cole/ })).toHaveAttribute("href", person.href);
  await expect(page.getByText("Student designer")).toBeVisible();
  await expect(page.getByRole("img", { name: "Verified identity" })).toBeVisible();
  await page.getByRole("button", { name: "More results" }).click();
  await expect(page.getByRole("link", { name: /Maya Learning Centre/ })).toHaveAttribute("href", organization.href);
  await expect(page.getByRole("img", { name: "Verified organization" })).toBeVisible();
  await page.getByRole("navigation", { name: "Search filters" }).getByRole("link", { name: "Organizations", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Search filters" }).getByRole("link", { name: "Organizations", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: /Maya Cole/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Maya Learning Centre/ })).toBeVisible();
  expect(searches).toEqual([
    { q: "maya", kind: "all" },
    { q: "maya", kind: "all", cursor: "synthetic-page" },
    { q: "maya", kind: "organizations" },
  ]);
  expect(errors).toEqual([]);
});
